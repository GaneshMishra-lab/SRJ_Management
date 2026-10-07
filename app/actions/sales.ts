"use server";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import {
  itemApproval,
  itemOrder,
  itemPurchased,
  itemSale,
  itemSaleBill,
  itemSaleDetails,
  itemStock,
  oldItem,
} from "@/db/schema/sales";
import { getCurrentUser, logAudit, requireOwner } from "@/lib/dal";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { dateOnly, istDate, parseDbDate } from "@/lib/format";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { priceSaleLine, purityRate, round2, round3 } from "@/lib/pricing";

export type SalePayload = {
  date?: string; // the bill's own day (YYYY-MM-DD) when it is entered later; today if left out
  time?: string; // the time on that day (HH:MM); the time now if left out
  customerId?: string;
  newCustomer?: { name: string; contact?: string };
  // Delivering an order: its piece must be on the bill and its advance is applied.
  orderId?: string;
  items: Array<{ stockId: string; rate: number; makingPct: number }>;
  // Old metal the customer gives in exchange, set against the bill.
  oldGold?: Array<{ metal: string; weight: number; melting: number; amt: number }>;
  discount: number;
  paidAmt: number;
  mode: string;
  // The day the money is entered in the cash book, when later than the bill's own day:
  // a corrected bill replacing a cancelled one takes its payment on the day of correction.
  paymentDate?: string;
};

function revalidateSales() {
  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/orders");
  revalidatePath("/old-gold");
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
}

export async function createSale(payload: SalePayload) {
  const user = await getCurrentUser();

  try {
    const stockIds = payload.items.map((item) => item.stockId);
    if (stockIds.length === 0) throw new UserError("Add at least one piece to the bill.");
    if (new Set(stockIds).size !== stockIds.length || !stockIds.every(isUuid)) {
      throw new UserError("A piece is listed twice or is not valid.");
    }
    if (payload.items.some((item) => !(item.rate > 0) || !(item.makingPct >= 0))) {
      throw new UserError("Every piece needs a rate above zero and a making % of zero or more.");
    }
    const discount = round2(payload.discount || 0);
    const paidAmt = round2(payload.paidAmt || 0);
    if (discount < 0 || paidAmt < 0) throw new UserError("Discount and amount paid cannot be negative.");
    if (paidAmt > 0 && !isCashMode(payload.mode)) throw new UserError("Choose how the customer paid.");

    const oldGold = (payload.oldGold ?? []).map((old) => ({
      metal: old.metal,
      weight: round3(old.weight),
      melting: round3(old.melting),
      amt: round2(old.amt),
    }));
    if (oldGold.some((old) => !["Gold", "Silver", "Phuli"].includes(old.metal) || old.weight <= 0 || old.amt <= 0 || old.melting <= 0 || old.melting > 100)) {
      throw new UserError("Each old item needs a metal, weight, melting and agreed value.");
    }
    if (payload.orderId && !isUuid(payload.orderId)) throw new UserError("Order not found.");
    // The bill, old metal taken in and any payment made with it all carry the bill's own date.
    const date = entryDate(payload.date, payload.time);
    const paidOn = payload.paymentDate ? entryDate(payload.paymentDate) : date;
    if (parseDbDate(paidOn) < parseDbDate(date)) throw new UserError("The payment date cannot be before the bill date.");

    const saleId = await db.transaction(async (tx) => {
      let customerId = payload.customerId;
      if (!customerId) {
        const name = payload.newCustomer?.name.trim();
        if (!name) throw new UserError("Choose a customer or enter a new customer's name.");
        const [customer] = await tx.insert(entity).values({
          name,
          type: "customer",
          contact: payload.newCustomer?.contact?.trim() || null,
        }).returning();
        await logAudit(tx, user.id, { tableName: "entity", recordId: customer.id, action: "insert", newValues: customer });
        customerId = customer.id;
      }

      // Claim the pieces; only ones in the shop or out on approval can be sold.
      const sold = await tx.update(itemStock)
        .set({ status: "sold", updatedAt: new Date() })
        .where(and(inArray(itemStock.id, stockIds), inArray(itemStock.status, ["stock", "on_approval"])))
        .returning({ id: itemStock.id, netWeight: itemStock.netWeight, melting: itemStock.melting });
      if (sold.length !== stockIds.length) {
        throw new UserError("One of these pieces is no longer available. Reload and try again.");
      }
      await tx.update(itemApproval)
        .set({ dateBack: date, outcome: "sold", updatedAt: new Date() })
        .where(and(inArray(itemApproval.item, stockIds), isNull(itemApproval.dateBack)));
      const pieces = new Map(sold.map((piece) => [piece.id, piece]));

      // Delivering an order: close it, and price its piece at the booked rate if one was fixed.
      let advance = 0;
      const bookedRates = new Map<string, number>();
      if (payload.orderId) {
        const [order] = await tx.update(itemOrder)
          .set({ status: "dispatched", updatedAt: new Date() })
          .where(and(eq(itemOrder.id, payload.orderId), eq(itemOrder.customer, customerId), ne(itemOrder.status, "dispatched")))
          .returning();
        if (!order) throw new UserError("That order is not this customer's, or is already delivered.");

        const made = await tx
          .select({ id: itemStock.id })
          .from(itemStock)
          .innerJoin(itemPurchased, eq(itemStock.item, itemPurchased.id))
          .where(eq(itemPurchased.order, order.id));
        const onBill = made.filter((piece) => pieces.has(piece.id));
        if (onBill.length === 0) throw new UserError("The piece made for this order must be on the bill.");

        advance = order.amtPaid ?? 0;
        if (order.rateBooked && order.bookedRate) {
          for (const piece of onBill) {
            bookedRates.set(piece.id, purityRate(order.bookedRate, pieces.get(piece.id)?.melting ?? 0));
          }
        }
      }

      const lines = payload.items.map((item) => {
        const rate = bookedRates.get(item.stockId) ?? round2(item.rate);
        return {
          item: item.stockId,
          rate,
          makingPct: item.makingPct,
          ...priceSaleLine({ netWeight: pieces.get(item.stockId)?.netWeight ?? 0, rate, makingPct: item.makingPct }),
        };
      });

      const computedAmt = round2(lines.reduce((sum, line) => sum + line.amt, 0));
      if (discount > computedAmt) throw new UserError("Discount is more than the bill amount.");
      const totalAmt = round2(computedAmt - discount);
      const oldGoldAmt = round2(oldGold.reduce((sum, old) => sum + old.amt, 0));
      const settled = round2(advance + oldGoldAmt + paidAmt);
      if (settled > totalAmt) {
        throw new UserError("Advance, old metal and payment together come to more than the bill total. Buy the old metal separately or lower the payment.");
      }

      const [saleBill] = await tx.insert(itemSaleBill).values({
        date,
        customer: customerId,
        order: payload.orderId ?? null,
        computedAmt,
        discount,
        totalAmt,
        paidAmt: settled,
      }).returning();

      await tx.insert(itemSale).values(lines.map((line) => ({ ...line, bill: saleBill.id })));

      // Neither of these moves cash: the advance was recorded when taken, old metal is an exchange.
      if (advance > 0) {
        await tx.insert(itemSaleDetails).values({ sale: saleBill.id, date, amtPaid: advance, mode: "order_advance" });
      }
      for (const old of oldGold) {
        const [row] = await tx.insert(oldItem).values({
          customer: customerId, date, ...old,
          paidAmt: old.amt, saleBill: saleBill.id, status: "vault",
        }).returning();
        await tx.insert(itemSaleDetails).values({ sale: saleBill.id, date, amtPaid: old.amt, mode: "old_item" });
        await logAudit(tx, user.id, { tableName: "old_item", recordId: row.id, action: "insert", newValues: row });
      }

      if (paidAmt > 0 && isCashMode(payload.mode)) {
        const [payment] = await tx.insert(itemSaleDetails).values({
          sale: saleBill.id,
          date: paidOn,
          amtPaid: paidAmt,
          mode: payload.mode,
        }).returning();
        await recordCash(tx, {
          direction: "in",
          amt: paidAmt,
          location: locationFor(payload.mode),
          sourceTable: "item_sale_details",
          sourceId: payment.id,
          desc: "Payment received on sale bill",
          date: paidOn,
        });
      }

      await logAudit(tx, user.id, {
        tableName: "item_sale_bill",
        recordId: saleBill.id,
        action: "insert",
        newValues: { ...saleBill, lines, advance, oldGold },
      });
      return saleBill.id;
    });

    revalidateSales();
    return { success: true as const, id: saleId };
  } catch (error) {
    return { success: false as const, error: fail(error, "Failed to create the sale.")?.error };
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
    await db.transaction(async (tx) => {
      // Only succeeds while the payment fits in what is still due.
      const [updated] = await tx.update(itemSaleBill)
        .set({ paidAmt: sql`coalesce(${itemSaleBill.paidAmt}, 0) + ${amt}`, updatedAt: new Date() })
        .where(and(
          eq(itemSaleBill.id, saleId),
          isNull(itemSaleBill.cancelledAt),
          sql`coalesce(${itemSaleBill.paidAmt}, 0) + ${amt} <= coalesce(${itemSaleBill.totalAmt}, 0)`,
        ))
        .returning();
      if (!updated) throw new UserError("That is more than what is due on this bill.");

      const [payment] = await tx.insert(itemSaleDetails).values({
        sale: saleId,
        date,
        amtPaid: amt,
        mode,
      }).returning();
      await recordCash(tx, {
        direction: "in",
        amt,
        location: locationFor(mode),
        sourceTable: "item_sale_details",
        sourceId: payment.id,
        desc: "Payment received on sale bill",
        date,
      });
      await logAudit(tx, user.id, { tableName: "item_sale_details", recordId: payment.id, action: "insert", newValues: payment });
    });
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
      const lines = await tx.select({ item: itemSale.item }).from(itemSale).where(eq(itemSale.bill, saleId));
      const stockIds = lines.map((line) => line.item).filter((item): item is string => !!item);
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
          oldMetalReturned: exchanged.map((old) => old.id), orderReopened: saleBill.order,
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
