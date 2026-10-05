"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { isBullionStandard, isStandard, recordMetal } from "@/lib/metal";
import { convertStandard, Standard } from "@/lib/standards";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import {
  bill,
  billPayment,
  itemApproval,
  itemPurchased,
  itemStock,
  langdiLedger,
  supplierReturn,
  supplierReturnSettlement,
} from "@/db/schema/sales";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2, round3 } from "@/lib/pricing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function revalidateStock(stockId: string) {
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${stockId}`);
  revalidatePath("/dashboard");
}

// Moves a piece between statuses; fails if someone else has already moved it.
async function moveStock(tx: Tx, stockId: string, from: string, to: string) {
  const [piece] = await tx.update(itemStock)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(itemStock.id, stockId), eq(itemStock.status, from)))
    .returning();
  if (!piece) throw new UserError("This piece has already been moved. Reload the page.");
  return piece;
}

export async function sendOnApproval(stockId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const entityId = text(formData, "entity");
  const newName = text(formData, "newName");
  const newContact = text(formData, "newContact");
  const note = text(formData, "note");

  if (!isUuid(stockId)) return { error: "Piece not found." };
  if (!newName && !isUuid(entityId)) return { error: "Choose who is taking the piece, or enter a new customer." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      let holder = entityId;
      if (newName) {
        const [customer] = await tx.insert(entity).values({ name: newName, type: "customer", contact: newContact || null }).returning();
        await logAudit(tx, user.id, { tableName: "entity", recordId: customer.id, action: "insert", newValues: customer });
        holder = customer.id;
      }

      await moveStock(tx, stockId, "stock", "on_approval");
      const [approval] = await tx.insert(itemApproval).values({
        item: stockId,
        entity: holder,
        dateOut: date,
        note: note || null,
      }).returning();
      await logAudit(tx, user.id, { tableName: "item_approval", recordId: approval.id, action: "insert", newValues: approval });
    });
  } catch (error) {
    return fail(error, "Could not send the piece on approval.");
  }

  revalidateStock(stockId);
  return { success: "Piece sent on approval." };
}

export async function returnFromApproval(stockId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(stockId)) return { error: "Piece not found." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      await moveStock(tx, stockId, "on_approval", "stock");
      const [approval] = await tx.update(itemApproval)
        .set({ dateBack: date, outcome: "returned", updatedAt: new Date() })
        .where(and(eq(itemApproval.item, stockId), isNull(itemApproval.dateBack)))
        .returning();
      if (approval) {
        await logAudit(tx, user.id, { tableName: "item_approval", recordId: approval.id, action: "update", newValues: approval });
      }
    });
  } catch (error) {
    return fail(error, "Could not mark the piece as returned.");
  }

  revalidateStock(stockId);
  return { success: "Piece is back in stock." };
}

// The original bill is left untouched; the return is settled separately.
export async function returnToSupplier(stockId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const fine = round3(num(formData, "fine"));

  if (!isUuid(stockId)) return { error: "Piece not found." };
  if (amt <= 0) return { error: "Enter the value the supplier is taking it back at." };
  if (fine < 0) return { error: "Fine weight cannot be negative." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const piece = await moveStock(tx, stockId, "stock", "returned_to_supplier");
      if (!piece.item) throw new UserError("Only pieces bought from a supplier can be returned to one.");

      const [purchase] = await tx
        .select({ billId: bill.id, supplier: bill.supplier })
        .from(itemPurchased)
        .innerJoin(bill, eq(itemPurchased.bill, bill.id))
        .where(eq(itemPurchased.id, piece.item));
      if (!purchase?.supplier) throw new UserError("The purchase bill for this piece has no supplier.");

      const [row] = await tx.insert(supplierReturn).values({
        date,
        supplier: purchase.supplier,
        item: stockId,
        bill: purchase.billId,
        amt,
        fine,
      }).returning();
      await logAudit(tx, user.id, { tableName: "supplier_return", recordId: row.id, action: "insert", newValues: row });
    });
  } catch (error) {
    return fail(error, "Could not record the return.");
  }

  revalidateStock(stockId);
  return { success: "Piece returned to supplier." };
}

export async function settleSupplierReturn(returnId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");

  if (!isUuid(returnId)) return { error: "Return not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose how the supplier paid." };

  let stockId: string | undefined;
  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      // Lock the return so two settlements cannot both fit in the same balance.
      const [ret] = await tx.select().from(supplierReturn).where(eq(supplierReturn.id, returnId)).for("update");
      if (!ret) throw new UserError("Return not found.");
      stockId = ret.item;

      const [{ settled }] = await tx
        .select({ settled: sql<number>`coalesce(sum(${supplierReturnSettlement.amt}), 0)`.mapWith(Number) })
        .from(supplierReturnSettlement)
        .where(eq(supplierReturnSettlement.supplierReturn, returnId));
      if (amt > round2((ret.amt ?? 0) - settled)) throw new UserError("That is more than what the supplier still owes for this return.");

      const [row] = await tx.insert(supplierReturnSettlement).values({
        supplierReturn: returnId,
        date,
        mode,
        amt,
      }).returning();
      await recordCash(tx, {
        direction: "in",
        amt,
        location: locationFor(mode),
        sourceTable: "supplier_return_settlement",
        sourceId: row.id,
        desc: "Supplier settled a returned piece",
        date,
      });
      await logAudit(tx, user.id, { tableName: "supplier_return_settlement", recordId: row.id, action: "insert", newValues: row });
    });
  } catch (error) {
    return fail(error, "Could not record the settlement.");
  }

  if (stockId) revalidatePath(`/inventory/${stockId}`);
  revalidatePath("/ledgers");
  revalidatePath("/dashboard");
  return { success: "Settlement recorded." };
}

// A melted piece leaves stock and enters the langdi ledger by weight.
export async function meltItem(stockId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const weight = round3(num(formData, "weight"));
  const estPurity = round3(num(formData, "estPurity"));

  if (!isUuid(stockId)) return { error: "Piece not found." };
  if (weight <= 0) return { error: "Enter the melted weight." };
  if (estPurity <= 0 || estPurity > 100) return { error: "Estimated purity must be between 0 and 100." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const piece = await moveStock(tx, stockId, "stock", "melted");
      const [entry] = await tx.insert(langdiLedger).values({
        date,
        metal: piece.metal,
        direction: "in",
        weight,
        pieces: 1,
        estPurity,
        sourceTable: "melt",
        sourceId: stockId,
        desc: "Melted from stock",
      }).returning();
      await tx.update(itemStock).set({ langdiEntry: entry.id }).where(eq(itemStock.id, stockId));
      await logAudit(tx, user.id, { tableName: "langdi_ledger", recordId: entry.id, action: "insert", newValues: entry });
    });
  } catch (error) {
    return fail(error, "Could not record the melt.");
  }

  revalidateStock(stockId);
  return { success: "Piece melted into langdi." };
}

// Locks a return and works out what the supplier still owes for it.
async function returnPosition(tx: Tx, returnId: string) {
  const [ret] = await tx.select().from(supplierReturn).where(eq(supplierReturn.id, returnId)).for("update");
  if (!ret) throw new UserError("Return not found.");
  const [{ settled }] = await tx
    .select({ settled: sql<number>`coalesce(sum(${supplierReturnSettlement.amt}), 0)`.mapWith(Number) })
    .from(supplierReturnSettlement)
    .where(eq(supplierReturnSettlement.supplierReturn, returnId));
  return { ret, due: round2((ret.amt ?? 0) - settled) };
}

function revalidateReturn(stockId?: string) {
  if (stockId) revalidatePath(`/inventory/${stockId}`);
  revalidatePath("/purchases");
  revalidatePath("/metal");
  revalidatePath("/dashboard");
}

// The supplier gives fine bullion back for a returned piece, valued at the original bill's rate.
export async function settleSupplierReturnFine(returnId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const weight = round3(num(formData, "weight"));
  const given = text(formData, "standard");
  if (!isUuid(returnId)) return { error: "Return not found." };
  if (weight <= 0) return { error: "Enter the fine weight received." };
  if (!isBullionStandard(given)) return { error: "Choose the standard of the metal received." };

  let stockId: string | undefined;
  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const { ret, due } = await returnPosition(tx, returnId);
      stockId = ret.item;
      const [original] = ret.bill ? await tx.select().from(bill).where(eq(bill.id, ret.bill)) : [];
      if (!original?.rate) throw new UserError("The original bill has no rate, so metal cannot be valued against this return.");

      const standard: Standard = original.standard && isStandard(original.standard) ? original.standard : "995";
      let amt = round2(convertStandard(weight, given, standard) * original.rate);
      if (amt > due && amt - due <= original.rate * 0.001) amt = due;
      if (amt > due) throw new UserError("That is more than what the supplier still owes for this return.");

      const [row] = await tx.insert(supplierReturnSettlement).values({
        supplierReturn: returnId, date, mode: "fine", amt, fineWeight: weight, standard: given,
      }).returning();
      await recordMetal(tx, {
        metal: original.metal ?? "Gold", standard: given, direction: "in", weight,
        sourceTable: "supplier_return_settlement", sourceId: row.id, desc: "Fine received for a returned piece", date,
      });
      await logAudit(tx, user.id, { tableName: "supplier_return_settlement", recordId: row.id, action: "insert", newValues: row });
    });
  } catch (error) {
    return fail(error, "Could not record the settlement.");
  }

  revalidateReturn(stockId);
  return { success: "Fine settlement recorded." };
}

// Set what the supplier owes for a return against one of their unpaid bills. No cash or metal moves.
export async function creditSupplierReturn(returnId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const billId = text(formData, "bill");
  const amt = round2(num(formData, "amt"));
  if (!isUuid(returnId)) return { error: "Return not found." };
  if (!isUuid(billId)) return { error: "Choose the bill to credit." };
  if (amt <= 0) return { error: "Enter an amount above zero." };

  let stockId: string | undefined;
  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const { ret, due } = await returnPosition(tx, returnId);
      stockId = ret.item;
      if (amt > due) throw new UserError("That is more than what the supplier still owes for this return.");

      const [credited] = await tx.update(bill)
        .set({ paidAmt: sql`coalesce(${bill.paidAmt}, 0) + ${amt}`, updatedAt: new Date() })
        .where(and(
          eq(bill.id, billId),
          eq(bill.supplier, ret.supplier),
          sql`coalesce(${bill.paidAmt}, 0) + ${amt} <= coalesce(${bill.billAmt}, 0)`,
        ))
        .returning();
      if (!credited) throw new UserError("That bill is not this supplier's, or the credit is more than what is due on it.");

      const [payment] = await tx.insert(billPayment).values({
        bill: billId, date, amt, mode: "return_credit",
      }).returning();
      const [row] = await tx.insert(supplierReturnSettlement).values({
        supplierReturn: returnId, date, mode: "bill_credit", amt, billPayment: payment.id,
      }).returning();
      await logAudit(tx, user.id, { tableName: "supplier_return_settlement", recordId: row.id, action: "insert", newValues: row });
    });
  } catch (error) {
    return fail(error, "Could not record the credit.");
  }

  revalidateReturn(stockId);
  revalidatePath(`/purchases/${billId}`);
  return { success: "Credit applied to the bill." };
}
