"use server";

import { db } from "@/db";
import { bill, itemOrder, itemPurchased, itemType, billPayment, langdiLedger } from "@/db/schema/sales";
import { entity } from "@/db/schema/entities";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { convertStandard, Standard } from "@/lib/standards";
import { Tx } from "@/lib/entities";
import { isBullionStandard, isStandard, langdiToFine, recordMetal } from "@/lib/metal";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { parseDue } from "@/lib/due";
import { parseDbDate } from "@/lib/format";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2, round3 } from "@/lib/pricing";

export async function createSupplier(name: string, contact?: string) {
  const user = await getCurrentUser();
  try {
    const [newSupplier] = await db.insert(entity).values({
      name,
      type: "supplier",
      contact,
    }).returning();
    await logAudit(db, user.id, { tableName: "entity", recordId: newSupplier.id, action: "insert", newValues: newSupplier });
    
    revalidatePath("/purchases/new");
    return { success: true, data: newSupplier };
  } catch (error) {
    console.error("Supplier creation failed:", error);
    return { success: false, error: "Failed to create supplier." };
  }
}

// A loose type (mani) is kept by weight; piecesPerGram is how many of it weigh a gram, if that is known.
export async function createItemType(name: string, metal: string, loose = false, piecesPerGram?: number) {
  const user = await getCurrentUser();
  try {
    const [newItemType] = await db.insert(itemType).values({
      name,
      metal,
      loose,
      piecesPerGram: loose && piecesPerGram && piecesPerGram > 0 ? Math.trunc(piecesPerGram) : null,
    }).returning();
    await logAudit(db, user.id, { tableName: "item_type", recordId: newItemType.id, action: "insert", newValues: newItemType });
    
    revalidatePath("/inventory");
    revalidatePath("/purchases/new");
    return { success: true, data: newItemType };
  } catch (error) {
    console.error("Item Type creation failed:", error);
    return { success: false, error: "Failed to create item type." };
  }
}


// Type definitions for the payload
export type PurchasePayload = {
  date?: string; // the bill's own day (YYYY-MM-DD) when it is entered later; today if left out
  time?: string; // the time on that day (HH:MM); the time now if left out
  supplierId: string;
  metal: string;
  standard: Standard;
  rate: number;
  billAmt: number;
  fine: number;
  paidAmt: number;
  mode: string;
  // The supplier's credit on what is left unpaid: a number of days from the bill's day, or the
  // due date itself. Both empty when no date was agreed.
  creditDays?: string;
  dueDate?: string;
  items: Array<{
    itemTypeId: string;
    grossWeight: number;
    netWeight: number;
    melting: number;
    wastage: number;
    making: number;
    extraCharges: number;
    amt: number;
    orderId?: string;
  }>;
};

export async function createPurchase(payload: PurchasePayload) {
  const user = await getCurrentUser();
  try {
    // The bill, the pieces received and any payment made with it all carry the bill's own date.
    const date = entryDate(payload.date, payload.time);
    // A bill paid in full on the spot has nothing left to fall due.
    const dueDate = payload.paidAmt < payload.billAmt ? parseDue(payload.dueDate, payload.creditDays, date) : null;
    await db.transaction(async (tx) => {
      // 1. Create the Bill
      const [newBill] = await tx.insert(bill).values({
        supplier: payload.supplierId,
        date,
        metal: payload.metal,
        standard: payload.standard,
        rate: payload.rate,
        billAmt: payload.billAmt,
        fine: payload.fine,
        paidAmt: payload.paidAmt,
        dueDate,
      }).returning();
      await logAudit(tx, user.id, {
        tableName: "bill",
        recordId: newBill.id,
        action: "insert",
        newValues: { ...newBill, items: payload.items },
      });

      // 2. Create Bill Payment if there is an upfront payment
      if (payload.paidAmt > 0) {
        const [newPayment] = await tx.insert(billPayment).values({
          bill: newBill.id,
          date,
          amt: payload.paidAmt,
          mode: payload.mode,
        }).returning();

        // 3. Create Cash Ledger OUT entry
        await recordCash(tx, {
          direction: 'out',
          amt: payload.paidAmt,
          location: payload.mode === 'cash' ? 'vault' : 'account',
          sourceTable: 'bill_payment',
          sourceId: newPayment.id,
          desc: 'Payment to supplier on purchase bill',
          date,
        });
      }

      // 4. Create the purchased items. They enter stock later, when each one is labelled.
      const types = await tx.select({ id: itemType.id, metal: itemType.metal }).from(itemType);
      for (const item of payload.items) {
        if (!types.some((type) => type.id === item.itemTypeId && type.metal === payload.metal)) {
          throw new UserError("Choose an item type for every item.");
        }
        const [newItem] = await tx.insert(itemPurchased).values({
          bill: newBill.id,
          itemType: item.itemTypeId,
          grossWeight: item.grossWeight,
          netWeight: item.netWeight,
          melting: item.melting,
          wastage: item.wastage,
          making: item.making,
          extraCharges: item.extraCharges,
          amt: item.amt,
          order: item.orderId && isUuid(item.orderId) ? item.orderId : null,
        }).returning();
        if (newItem.order) {
          // The ordered piece has arrived from the maker.
          await tx.update(itemOrder)
            .set({ status: "at shop", updatedAt: new Date() })
            .where(and(eq(itemOrder.id, newItem.order), inArray(itemOrder.status, ["order taken", "being made"])));
        }
      }
    });

    revalidatePath("/purchases");
    revalidatePath("/inventory");
    revalidatePath("/orders");
    revalidatePath("/dashboard");
    revalidatePath("/ledgers");
    revalidatePath("/daybook");
    
    return { success: true };
  } catch (error) {
    return { success: false, error: fail(error, "Failed to create purchase record.")?.error };
  }
}

export async function addBillPayment(billId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");

  if (!isUuid(billId)) return { error: "Bill not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose how the supplier was paid." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      // Only succeeds while the payment fits in what is still due.
      const [updated] = await tx.update(bill)
        .set({ paidAmt: sql`coalesce(${bill.paidAmt}, 0) + ${amt}`, updatedAt: new Date() })
        .where(and(
          eq(bill.id, billId),
          sql`coalesce(${bill.paidAmt}, 0) + ${amt} <= coalesce(${bill.billAmt}, 0)`,
        ))
        .returning();
      if (!updated) throw new UserError("That is more than what is due on this bill.");

      const [payment] = await tx.insert(billPayment).values({
        bill: billId,
        date,
        amt,
        mode,
      }).returning();
      await recordCash(tx, {
        direction: "out",
        amt,
        location: locationFor(mode),
        sourceTable: "bill_payment",
        sourceId: payment.id,
        desc: "Payment to supplier on purchase bill",
        date,
      });
      await logAudit(tx, user.id, { tableName: "bill_payment", recordId: payment.id, action: "insert", newValues: payment });
    });
  } catch (error) {
    return fail(error, "Could not record the payment.");
  }

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${billId}`);
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
  return { success: "Payment recorded." };
}

// Set, change or clear the day a bill's credit runs out. Counted in days, it is from the bill's own day.
export async function setBillDueDate(billId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(billId)) return { error: "Bill not found." };

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(bill).where(eq(bill.id, billId)).for("update");
      if (!row) throw new UserError("Bill not found.");
      const dueDate = parseDue(text(formData, "dueDate"), text(formData, "creditDays"), parseDbDate(row.date ?? row.createdAt).toISOString());
      await tx.update(bill).set({ dueDate, updatedAt: new Date() }).where(eq(bill.id, billId));
      await logAudit(tx, user.id, { tableName: "bill", recordId: billId, action: "update", oldValues: { dueDate: row.dueDate }, newValues: { dueDate } });
    });
  } catch (error) {
    return fail(error, "Could not save the due date.");
  }

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${billId}`);
  revalidatePath("/dashboard");
  return { success: "Due date saved." };
}

// Locks the bill and values metal handed over at the bill's own rate and standard.
async function applyMetalPayment(tx: Tx, billId: string, fineInStandard: (standard: Standard) => number) {
  const [row] = await tx.select().from(bill).where(eq(bill.id, billId)).for("update");
  if (!row) throw new UserError("Bill not found.");
  if (!row.rate) throw new UserError("This bill has no rate, so metal cannot be valued against it.");

  const standard: Standard = row.standard && isStandard(row.standard) ? row.standard : "995";
  const fine = fineInStandard(standard);
  const due = round2((row.billAmt ?? 0) - (row.paidAmt ?? 0));
  let amt = round2(fine * row.rate);
  // Grams are kept to 3 places, so clearing a bill exactly in metal can overshoot by under a milligram's worth.
  if (amt > due && amt - due <= row.rate * 0.001) amt = due;
  if (amt <= 0) throw new UserError("Enter a weight above zero.");
  if (amt > due) throw new UserError("That is more than what is due on this bill.");

  await tx.update(bill).set({ paidAmt: round2((row.paidAmt ?? 0) + amt), updatedAt: new Date() }).where(eq(bill.id, billId));
  return { row, standard, fine, amt };
}

function revalidateBill(billId: string) {
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${billId}`);
  revalidatePath("/metal");
  revalidatePath("/dashboard");
}

// Pay a supplier in fine bullion. No cash moves; the metal ledger goes down.
export async function addBillFinePayment(billId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const weight = round3(num(formData, "weight"));
  const given = text(formData, "standard");
  if (!isUuid(billId)) return { error: "Bill not found." };
  if (weight <= 0) return { error: "Enter the fine weight given." };
  if (!isBullionStandard(given)) return { error: "Choose the standard of the metal given." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const { row, amt } = await applyMetalPayment(tx, billId, (standard) => round3(convertStandard(weight, given, standard)));
      const [payment] = await tx.insert(billPayment).values({
        bill: billId, date, amt, mode: "fine", fineWeight: weight, standard: given,
      }).returning();
      await recordMetal(tx, {
        metal: row.metal ?? "Gold", standard: given, direction: "out", weight,
        sourceTable: "bill_payment", sourceId: payment.id, desc: "Fine given to supplier against a bill", date,
      });
      await logAudit(tx, user.id, { tableName: "bill_payment", recordId: payment.id, action: "insert", newValues: payment });
    });
  } catch (error) {
    return fail(error, "Could not record the fine payment.");
  }

  revalidateBill(billId);
  return { success: "Fine payment recorded." };
}

// Pay a supplier in langdi, valued as fine in the bill's standard.
export async function addBillLangdiPayment(billId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const weight = round3(num(formData, "weight"));
  const testedPurity = round3(num(formData, "testedPurity"));
  const deduction = round3(num(formData, "deduction"));
  if (!isUuid(billId)) return { error: "Bill not found." };
  if (weight <= 0) return { error: "Enter the langdi weight given." };
  if (testedPurity <= 0 || testedPurity > 100) return { error: "Tested purity must be between 0 and 100." };
  if (deduction < 0 || deduction >= weight) return { error: "Refining deduction must be less than the weight." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const { row, standard, fine, amt } = await applyMetalPayment(tx, billId, (std) => langdiToFine(weight, testedPurity, deduction, std));
      const [payment] = await tx.insert(billPayment).values({
        bill: billId, date, amt, mode: "langdi", fineWeight: fine, standard,
      }).returning();
      await tx.insert(langdiLedger).values({
        date, metal: row.metal ?? "Gold", direction: "out", weight, testedPurity,
        refiningDeduction: deduction, fineWeight: fine, standard,
        sourceTable: "bill_payment", sourceId: payment.id, entity: row.supplier, desc: "Given to supplier against a bill",
      });
      await logAudit(tx, user.id, { tableName: "bill_payment", recordId: payment.id, action: "insert", newValues: { ...payment, langdiWeight: weight, testedPurity, deduction } });
    });
  } catch (error) {
    return fail(error, "Could not record the langdi payment.");
  }

  revalidateBill(billId);
  return { success: "Langdi payment recorded." };
}
