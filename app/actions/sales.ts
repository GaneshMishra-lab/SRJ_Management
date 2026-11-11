"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { lendEntry } from "@/db/schema/finance";
import { itemOrder, itemSale, itemSaleBill, itemSaleDetails, itemStock, oldItem } from "@/db/schema/sales";
import { recordLoose } from "@/lib/loose";
import { getCurrentUser, logAudit, requireOwner } from "@/lib/dal";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { dateOnly, istDate, parseDbDate } from "@/lib/format";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";
import { paySaleBill } from "@/lib/sale-payments";
import { moveAlsoPaid, parseSale, type SalePayload, unwriteSale, writeSale } from "@/lib/sale-write";


function revalidateSales() {
  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/orders");
  revalidatePath("/old-gold");
  revalidatePath("/bc");
  revalidatePath("/loans");
  revalidatePath("/loans/[kind]/[id]", "page");
  revalidatePath("/repairs");
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
}

export async function createSale(payload: SalePayload) {
  const user = await getCurrentUser();

  try {
    const sale = parseSale(payload);
    const saleId = await db.transaction(async (tx) => {
      const { saleBill, lines, looseLines, advance, towardsOld } = await writeSale(tx, user.id, sale);
      await logAudit(tx, user.id, {
        tableName: "item_sale_bill",
        recordId: saleBill.id,
        action: "insert",
        newValues: { ...saleBill, lines, looseLines, advance, oldGold: sale.oldGold, bcs: sale.bcs, fromLend: sale.fromLend, towardsOld },
      });
      return saleBill.id;
    });

    revalidateSales();
    return { success: true as const, id: saleId };
  } catch (error) {
    return { success: false as const, error: fail(error, "Failed to create the sale.")?.error };
  }
}

// Correct a bill in place, as if it had been entered right the first time: its pieces, loose
// metal, prices, discount, old metal, BC, money held, customer, day and the payment made with it.
// Earlier days of the day book change with it. Payments received later stay on the bill. The
// bill as it was is kept in the audit log with the reason. Owner only.
export async function editSale(saleId: string, payload: SalePayload, reason: string) {
  const owner = await requireOwner();

  try {
    if (!isUuid(saleId)) throw new UserError("Sale bill not found.");
    if (!reason.trim()) throw new UserError("Write what was wrong with the bill.");
    const sale = parseSale(payload);
    await db.transaction(async (tx) => {
      const undone = await unwriteSale(tx, saleId);
      const { saleBill, lines, looseLines, advance } = await writeSale(tx, owner.id, sale, undone.rewrite);
      // Money towards earlier dues paid along with the bill moves with the bill's payment day.
      if (istDate(parseDbDate(sale.paidOn)) !== istDate(parseDbDate(undone.bill.date ?? undone.bill.createdAt))) {
        await moveAlsoPaid(tx, undone.alsoPaid, sale.paidOn);
      }
      await logAudit(tx, owner.id, {
        tableName: "item_sale_bill",
        recordId: saleId,
        action: "update",
        oldValues: undone.before,
        newValues: { ...saleBill, lines, looseLines, advance, oldGold: sale.oldGold, bcs: sale.bcs, fromLend: sale.fromLend, paidAmt: sale.paidAmt, paidOn: sale.paidOn, edited: reason.trim() },
      });
    });

    revalidateSales();
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/parties");
    return { success: true as const, id: saleId };
  } catch (error) {
    return { success: false as const, error: fail(error, "Could not save the corrected bill.")?.error };
  }
}

// Give up part or all of what is still due on a bill as a further discount. No cash moves:
// the bill total comes down, so the cash ledger stays exactly as the money was received.
export async function discountSaleDue(saleId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const reason = text(formData, "reason");

  if (!isUuid(saleId)) return { error: "Sale bill not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };

  try {
    await db.transaction(async (tx) => {
      // Only succeeds while the discount fits in what is still due.
      const [updated] = await tx.update(itemSaleBill)
        .set({
          discount: sql`coalesce(${itemSaleBill.discount}, 0) + ${amt}`,
          totalAmt: sql`coalesce(${itemSaleBill.totalAmt}, 0) - ${amt}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(itemSaleBill.id, saleId),
          isNull(itemSaleBill.cancelledAt),
          sql`coalesce(${itemSaleBill.paidAmt}, 0) + ${amt} <= coalesce(${itemSaleBill.totalAmt}, 0)`,
        ))
        .returning();
      if (!updated) throw new UserError("That is more than what is due on this bill.");

      await logAudit(tx, user.id, {
        tableName: "item_sale_bill",
        recordId: saleId,
        action: "update",
        oldValues: { discount: round2((updated.discount ?? 0) - amt), totalAmt: round2((updated.totalAmt ?? 0) + amt) },
        newValues: { discount: updated.discount, totalAmt: updated.totalAmt, dueDiscounted: amt, reason: reason || null },
      });
    });
  } catch (error) {
    return fail(error, "Could not record the discount.");
  }

  revalidateSales();
  revalidatePath(`/sales/${saleId}`);
  return { success: "Discount recorded." };
}

export async function addSalePayment(saleId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");

  if (!isUuid(saleId)) return { error: "Sale bill not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose how the customer paid." };

  try {
    const date = entryDate(formData);
    await db.transaction((tx) => paySaleBill(tx, user.id, saleId, amt, mode, date));
  } catch (error) {
    return fail(error, "Could not record the payment.");
  }

  revalidateSales();
  revalidatePath(`/sales/${saleId}`);
  return { success: "Payment recorded." };
}

// Cancel a bill without erasing it. The bill and its payments stay as they were entered; money
// received is reversed by new cash entries on the day of cancellation, so the cash book of earlier
// days is never rewritten. Owner only.
export async function cancelSale(saleId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const reason = text(formData, "reason");
  if (!isUuid(saleId)) return { error: "Sale bill not found." };
  if (!reason) return { error: "Write the reason for cancelling this bill." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const [saleBill] = await tx.select().from(itemSaleBill).where(eq(itemSaleBill.id, saleId)).for("update");
      if (!saleBill) throw new UserError("Sale bill not found.");
      if (saleBill.cancelledAt) throw new UserError("This bill is already cancelled.");
      if (saleBill.date && istDate(parseDbDate(date)) < istDate(parseDbDate(saleBill.date))) {
        throw new UserError("A bill cannot be cancelled on a date before it was made.");
      }

      // Old metal taken in exchange goes back to the customer, so it must still be in the vault.
      const exchanged = await tx.select().from(oldItem).where(eq(oldItem.saleBill, saleId));
      if (exchanged.some((old) => old.status !== "vault")) {
        throw new UserError("Old metal taken on this bill has already been melted or refurbished, so the bill cannot be cancelled.");
      }
      if (exchanged.length > 0) {
        await tx.update(oldItem)
          .set({ status: "returned", processedDate: date, updatedAt: new Date() })
          .where(eq(oldItem.saleBill, saleId));
      }

      // The pieces come back into stock.
      const lines = await tx.select().from(itemSale).where(eq(itemSale.bill, saleId));
      const stockIds = lines.map((line) => line.item).filter((item): item is string => !!item);
      // Loose metal sold on the bill goes back into its box, on the day of cancellation.
      const looseBack = lines.filter((line) => !line.item && line.itemType);
      for (const line of looseBack) {
        await recordLoose(tx, {
          itemType: line.itemType!, melting: line.melting ?? 0, wastage: line.lotWastage ?? 0, making: line.lotMaking ?? 0,
          direction: "in", weight: line.weight ?? 0, pieces: line.pieces,
          sourceTable: "sale_cancel", sourceId: line.id, desc: `Cancelled sale bill of ${dateOnly(saleBill.date)}: back in stock`, date,
        });
      }
      if (stockIds.length > 0) {
        const back = await tx.update(itemStock)
          .set({ status: "stock", updatedAt: new Date() })
          .where(and(inArray(itemStock.id, stockIds), eq(itemStock.status, "sold")))
          .returning({ id: itemStock.id });
        if (back.length !== stockIds.length) throw new UserError("A piece on this bill is no longer marked as sold. Reload and check it.");
      }

      // A delivered order is open again; its advance was never moved off the order.
      if (saleBill.order) {
        await tx.update(itemOrder)
          .set({ status: "at shop", updatedAt: new Date() })
          .where(and(eq(itemOrder.id, saleBill.order), eq(itemOrder.status, "dispatched")));
      }

      // Money received goes back out of wherever it came in.
      const payments = await tx.select().from(itemSaleDetails).where(eq(itemSaleDetails.sale, saleId));
      const reversed: Record<string, number> = {};
      for (const mode of ["cash", "online"] as const) {
        const amt = round2(payments.filter((payment) => payment.mode === mode).reduce((sum, payment) => sum + (payment.amtPaid ?? 0), 0));
        if (amt <= 0) continue;
        await recordCash(tx, {
          direction: "out",
          amt,
          location: locationFor(mode),
          sourceTable: "item_sale_bill",
          sourceId: saleId,
          desc: `Cancelled sale bill of ${dateOnly(saleBill.date)}: money received reversed`,
          date,
        });
        reversed[mode] = amt;
      }
      // Money the shop held for the customer and spent on the bill is held again, from today.
      const lendUsed = await tx.select().from(lendEntry).where(and(eq(lendEntry.sale, saleId), eq(lendEntry.mode, "sale")));
      for (const used of lendUsed) {
        await tx.insert(lendEntry).values({ lend: used.lend, date, type: "taken", amt: used.amt, mode: "sale_cancel", sale: saleId });
      }

      await tx.update(itemSaleBill)
        .set({ cancelledAt: date, cancelReason: reason, updatedAt: new Date() })
        .where(eq(itemSaleBill.id, saleId));
      await logAudit(tx, owner.id, {
        tableName: "item_sale_bill",
        recordId: saleId,
        action: "update",
        oldValues: { cancelledAt: null },
        newValues: {
          cancelledAt: date, cancelReason: reason, reversed, piecesBackInStock: stockIds,
          looseBackInStock: looseBack.map((line) => ({ itemType: line.itemType, melting: line.melting, weight: line.weight })),
          oldMetalReturned: exchanged.map((old) => old.id), orderReopened: saleBill.order,
          // What was spent from a BC is on it again: its balance counts only bills not cancelled.
          bcReturned: payments.filter((payment) => payment.mode === "bc").map((payment) => ({ bc: payment.bc, amt: payment.amtPaid })),
          lendReturned: lendUsed.map((used) => ({ lend: used.lend, amt: used.amt })),
        },
      });
    });
  } catch (error) {
    return fail(error, "Could not cancel the bill.");
  }

  revalidateSales();
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/parties");
  return { success: "Bill cancelled." };
}
