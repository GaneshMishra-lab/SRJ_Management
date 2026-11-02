import "server-only";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { itemRepairing, itemRepairingPayment, itemSaleBill, itemSaleDetails } from "@/db/schema/sales";
import { logAudit } from "@/lib/dal";
import { balanceOf } from "@/lib/dues";
import type { Tx } from "@/lib/entities";
import { UserError } from "@/lib/form";
import { type CashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";

// Money a customer pays against sale bills, and money the shop holds for them. A customer who
// still owes the shop anything has udhari, not a deposit: whatever they bring pays the oldest
// dues first.

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

// Everything the customer owes the shop, other than sale bill `exceptId`, oldest first: unpaid
// sale bills, their loan account (old udhari from the paper books is loaded there) and unpaid
// repair charges. A gold loan is left out: it is closed with its interest on its own page.
// Locked, so that two payments cannot settle the same due.
async function oldDues(tx: Tx, customerId: string, exceptId?: string) {
  const bills = await tx
    .select({ id: itemSaleBill.id, date: itemSaleBill.date, due: sql<number>`coalesce(${itemSaleBill.totalAmt}, 0) - coalesce(${itemSaleBill.paidAmt}, 0)`.mapWith(Number) })
    .from(itemSaleBill)
    .where(and(
      eq(itemSaleBill.customer, customerId),
      isNull(itemSaleBill.cancelledAt),
      sql`coalesce(${itemSaleBill.totalAmt}, 0) > coalesce(${itemSaleBill.paidAmt}, 0)`,
      exceptId ? ne(itemSaleBill.id, exceptId) : undefined,
    ))
    .orderBy(asc(itemSaleBill.createdAt))
    .for("update");
  const repairs = await tx
    .select({ id: itemRepairing.id, date: itemRepairing.receivedDate, due: sql<number>`coalesce(${itemRepairing.amt}, 0) - coalesce(${itemRepairing.paidAmt}, 0)`.mapWith(Number) })
    .from(itemRepairing)
    .where(and(eq(itemRepairing.customer, customerId), sql`coalesce(${itemRepairing.amt}, 0) > coalesce(${itemRepairing.paidAmt}, 0)`))
    .for("update");
  // The loan account is one running balance; it counts as old as its first entry.
  const loans: { id: string; date: string | null; due: number }[] = [];
  const [account] = await tx.select({ id: loan.id }).from(loan).where(eq(loan.borrower, customerId)).for("update");
  if (account) {
    const [row] = await tx
      .select({ date: sql<string | null>`min(${loanEntry.date})`, due: balanceOf(loanEntry.amt, loanEntry.type) })
      .from(loanEntry)
      .where(eq(loanEntry.loan, account.id));
    if (row.due > 0) loans.push({ id: account.id, date: row.date, due: row.due });
  }

  return [
    ...bills.map((row) => ({ ...row, kind: "sale" as const })),
    ...loans.map((row) => ({ ...row, kind: "loan" as const })),
    ...repairs.map((row) => ({ ...row, kind: "repair" as const })),
  ]
    .map((row) => ({ ...row, due: round2(row.due) }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

// Pays what the customer owes, oldest first, out of `amt`. Returns what was paid and what is
// left over.
export async function payOldDues(tx: Tx, userId: number, customerId: string, amt: number, mode: CashMode, date: string, exceptId?: string) {
  let left = round2(amt);
  for (const owed of await oldDues(tx, customerId, exceptId)) {
    if (left <= 0) break;
    const part = Math.min(left, owed.due);
    if (owed.kind === "sale") await paySaleBill(tx, userId, owed.id, part, mode, date);
    else if (owed.kind === "loan") await payLoan(tx, userId, owed.id, part, mode, date);
    else await payRepair(tx, userId, owed.id, part, mode, date);
    left = round2(left - part);
  }
  return { paid: round2(amt - left), left };
}

// Written as the Loans and Repairs pages write a repayment, so each shows up there and in the
// day book under its own head.
async function payLoan(tx: Tx, userId: number, loanId: string, amt: number, mode: CashMode, date: string) {
  const [entry] = await tx.insert(loanEntry).values({ loan: loanId, date, type: "repayment", amt, mode }).returning();
  await recordCash(tx, {
    direction: "in", amt, location: locationFor(mode), sourceTable: "loan_entry", sourceId: entry.id, desc: "Loan repayment received", date,
  });
  await logAudit(tx, userId, { tableName: "loan_entry", recordId: entry.id, action: "insert", newValues: entry });
}

async function payRepair(tx: Tx, userId: number, repairId: string, amt: number, mode: CashMode, date: string) {
  await tx.update(itemRepairing)
    .set({ paidAmt: sql`coalesce(${itemRepairing.paidAmt}, 0) + ${amt}`, updatedAt: new Date() })
    .where(eq(itemRepairing.id, repairId));
  const [payment] = await tx.insert(itemRepairingPayment).values({ repair: repairId, date, amt, mode }).returning();
  await recordCash(tx, {
    direction: "in", amt, location: locationFor(mode), sourceTable: "item_repairing_payment", sourceId: payment.id, desc: "Repair charge received", date,
  });
  await logAudit(tx, userId, { tableName: "item_repairing_payment", recordId: payment.id, action: "insert", newValues: payment });
}

// The person's सावकारी (lend) account and what the shop holds on it, locked so that two bills
// cannot spend the same money.
export async function heldFor(tx: Tx, entityId: string) {
  const [account] = await tx.select({ id: lend.id }).from(lend).where(eq(lend.lender, entityId)).for("update");
  if (!account) return { lendId: null, held: 0 };
  const [{ held }] = await tx.select({ held: balanceOf(lendEntry.amt, lendEntry.type) }).from(lendEntry).where(eq(lendEntry.lend, account.id));
  return { lendId: account.id, held: round2(held) };
}
