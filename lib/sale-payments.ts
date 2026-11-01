import "server-only";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { lend, lendEntry } from "@/db/schema/finance";
import { itemSaleBill, itemSaleDetails } from "@/db/schema/sales";
import { logAudit } from "@/lib/dal";
import { balanceOf } from "@/lib/dues";
import type { Tx } from "@/lib/entities";
import { UserError } from "@/lib/form";
import { type CashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";

// Money a customer pays against sale bills, and money the shop holds for them. A customer who
// still owes on a bill has udhari, not a deposit: whatever they bring pays the oldest bills first.

// Money received on one bill. Only succeeds while the payment fits in what is still due.
export async function paySaleBill(tx: Tx, userId: number, saleId: string, amt: number, mode: CashMode, date: string) {
  const [updated] = await tx.update(itemSaleBill)
    .set({ paidAmt: sql`coalesce(${itemSaleBill.paidAmt}, 0) + ${amt}`, updatedAt: new Date() })
    .where(and(
      eq(itemSaleBill.id, saleId),
      isNull(itemSaleBill.cancelledAt),
      sql`coalesce(${itemSaleBill.paidAmt}, 0) + ${amt} <= coalesce(${itemSaleBill.totalAmt}, 0)`,
    ))
    .returning();
  if (!updated) throw new UserError("That is more than what is due on this bill.");

  const [payment] = await tx.insert(itemSaleDetails).values({ sale: saleId, date, amtPaid: amt, mode }).returning();
  await recordCash(tx, {
    direction: "in",
    amt,
    location: locationFor(mode),
    sourceTable: "item_sale_details",
    sourceId: payment.id,
    desc: "Payment received on sale bill",
    date,
  });
  await logAudit(tx, userId, { tableName: "item_sale_details", recordId: payment.id, action: "insert", newValues: payment });
}

const owing = (customerId: string, exceptId?: string) => and(
  eq(itemSaleBill.customer, customerId),
  isNull(itemSaleBill.cancelledAt),
  sql`coalesce(${itemSaleBill.totalAmt}, 0) > coalesce(${itemSaleBill.paidAmt}, 0)`,
  exceptId ? ne(itemSaleBill.id, exceptId) : undefined,
);

// Pays the customer's unpaid sale bills, oldest first, out of `amt`. Returns what was paid on
// them and what is left over.
export async function payOldBills(tx: Tx, userId: number, customerId: string, amt: number, mode: CashMode, date: string, exceptId?: string) {
  const bills = await tx
    .select({ id: itemSaleBill.id, totalAmt: itemSaleBill.totalAmt, paidAmt: itemSaleBill.paidAmt })
    .from(itemSaleBill)
    .where(owing(customerId, exceptId))
    .orderBy(asc(itemSaleBill.date), asc(itemSaleBill.createdAt))
    .for("update");
  let left = round2(amt);
  for (const bill of bills) {
    if (left <= 0) break;
    const part = Math.min(left, round2((bill.totalAmt ?? 0) - (bill.paidAmt ?? 0)));
    await paySaleBill(tx, userId, bill.id, part, mode, date);
    left = round2(left - part);
  }
  return { paid: round2(amt - left), left };
}

// What the customer still owes on sale bills, other than `exceptId`.
export async function udhariOf(tx: Tx, customerId: string, exceptId?: string) {
  const [{ due }] = await tx
    .select({ due: sql<number>`coalesce(sum(coalesce(${itemSaleBill.totalAmt}, 0) - coalesce(${itemSaleBill.paidAmt}, 0)), 0)`.mapWith(Number) })
    .from(itemSaleBill)
    .where(owing(customerId, exceptId));
  return round2(due);
}

// The person's सावकारी (lend) account and what the shop holds on it, locked so that two bills
// cannot spend the same money.
export async function heldFor(tx: Tx, entityId: string) {
  const [account] = await tx.select({ id: lend.id }).from(lend).where(eq(lend.lender, entityId)).for("update");
  if (!account) return { lendId: null, held: 0 };
  const [{ held }] = await tx.select({ held: balanceOf(lendEntry.amt, lendEntry.type) }).from(lendEntry).where(eq(lendEntry.lend, account.id));
  return { lendId: account.id, held: round2(held) };
}
