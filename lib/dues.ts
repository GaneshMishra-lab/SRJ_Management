import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity, miscItem } from "@/db/schema/entities";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { miscTrade } from "@/db/schema/ledger";
import { bill, goldLoan, itemRepairing, itemSaleBill, oldItem, supplierReturn, supplierReturnSettlement } from "@/db/schema/sales";
import { dateOnly, grams, parseDbDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";

// Everything owed to the shop and by it, whatever screen it was made on: plain loans and
// borrowings, and the unpaid part of bills, repairs, gold loans and the rest. Each line opens the
// screen that holds its details. The kinds are those the Parties page adds up, and misc purchases
// bought on credit.

export type Due = {
  id: string;
  kind: string;
  party: string | null;
  date: string | null; // when it was made; for a running account, its latest entry
  detail: string | null;
  amt: number; // the whole of it
  due: number; // what is still unpaid
  href: string;
};

// What is left of a running account: everything given or taken, less the repayments.
export const balanceOf = (amt: typeof loanEntry.amt | typeof lendEntry.amt, type: typeof loanEntry.type | typeof lendEntry.type) =>
  sql<number>`coalesce(sum(case when ${type} = 'repayment' then -${amt} else ${amt} end), 0)`.mapWith(Number);
const advancedOf = (amt: typeof loanEntry.amt | typeof lendEntry.amt, type: typeof loanEntry.type | typeof lendEntry.type) =>
  sql<number>`coalesce(sum(case when ${type} = 'repayment' then 0 else ${amt} end), 0)`.mapWith(Number);

const unpaid = (amt: number | null, paid: number | null) => round2((amt ?? 0) - (paid ?? 0));
const newestFirst = (a: Due, b: Due) => (b.date ? parseDbDate(b.date).getTime() : 0) - (a.date ? parseDbDate(a.date).getTime() : 0);
// A plain account is listed even when nothing is left on it, so that its history can be opened.
const outstanding = (groups: Due[][], plain: Due[]) => [...plain.sort(newestFirst), ...groups.flatMap((rows) => rows.filter((row) => row.due > 0).sort(newestFirst))];

export async function getDues() {
  const [loans, sales, repairs, goldLoans, returns, lends, bills, oldItems, misc] = await Promise.all([
    db
      .select({ id: loan.id, party: entity.name, date: sql<string | null>`max(${loanEntry.date})`, amt: advancedOf(loanEntry.amt, loanEntry.type), due: balanceOf(loanEntry.amt, loanEntry.type) })
      .from(loan)
      .innerJoin(entity, eq(loan.borrower, entity.id))
      .leftJoin(loanEntry, eq(loanEntry.loan, loan.id))
      .groupBy(loan.id, entity.name),
    db
      .select({ id: itemSaleBill.id, party: entity.name, date: itemSaleBill.date, amt: itemSaleBill.totalAmt, paid: itemSaleBill.paidAmt })
      .from(itemSaleBill)
      .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
      .where(isNull(itemSaleBill.cancelledAt)),
    db
      .select({ id: itemRepairing.id, party: entity.name, date: itemRepairing.receivedDate, detail: itemRepairing.desc, amt: itemRepairing.amt, paid: itemRepairing.paidAmt })
      .from(itemRepairing)
      .leftJoin(entity, eq(itemRepairing.customer, entity.id)),
    db
      .select({ id: goldLoan.id, party: entity.name, date: goldLoan.date, item: goldLoan.item, weight: goldLoan.weight, amt: goldLoan.amt, paid: goldLoan.amtPaid })
      .from(goldLoan)
      .leftJoin(entity, eq(goldLoan.customer, entity.id))
      .where(eq(goldLoan.status, "active")),
    db
      .select({
        id: supplierReturn.id, piece: supplierReturn.item, party: entity.name, date: supplierReturn.date, amt: supplierReturn.amt,
        paid: sql<number>`coalesce(sum(${supplierReturnSettlement.amt}), 0)`.mapWith(Number),
      })
      .from(supplierReturn)
      .leftJoin(entity, eq(supplierReturn.supplier, entity.id))
      .leftJoin(supplierReturnSettlement, eq(supplierReturnSettlement.supplierReturn, supplierReturn.id))
      .groupBy(supplierReturn.id, entity.name),
    db
      .select({ id: lend.id, party: entity.name, date: sql<string | null>`max(${lendEntry.date})`, amt: advancedOf(lendEntry.amt, lendEntry.type), due: balanceOf(lendEntry.amt, lendEntry.type) })
      .from(lend)
      .innerJoin(entity, eq(lend.lender, entity.id))
      .leftJoin(lendEntry, eq(lendEntry.lend, lend.id))
      .groupBy(lend.id, entity.name),
    db
      .select({ id: bill.id, party: entity.name, date: bill.date, metal: bill.metal, dueDate: bill.dueDate, amt: bill.billAmt, paid: bill.paidAmt })
      .from(bill)
      .leftJoin(entity, eq(bill.supplier, entity.id)),
    // Old metal bought outright; what came on a sale bill, an order or a defaulted pledge was never to be paid for.
    db
      .select({ id: oldItem.id, party: entity.name, date: oldItem.date, metal: oldItem.metal, weight: oldItem.weight, amt: oldItem.amt, paid: oldItem.paidAmt })
      .from(oldItem)
      .leftJoin(entity, eq(oldItem.customer, entity.id))
      .where(and(isNull(oldItem.saleBill), isNull(oldItem.order), isNull(oldItem.goldLoan))),
    db
      .select({ id: miscTrade.id, party: entity.name, date: miscTrade.date, qty: miscTrade.qty, item: miscItem.name, unit: miscItem.unit, dueDate: miscTrade.dueDate, amt: miscTrade.amt, paid: miscTrade.paidAmt })
      .from(miscTrade)
      .leftJoin(entity, eq(miscTrade.entity, entity.id))
      .leftJoin(miscItem, eq(miscTrade.item, miscItem.id))
      .where(eq(miscTrade.type, "purchase")),
  ]);

  const words = (...parts: (string | number | null | undefined | false)[]) => parts.filter(Boolean).join(" ") || null;
  const payBy = (date: string | null) => date && `to be paid by ${dateOnly(date)}`;

  const owed = outstanding(
    [
      sales.map((row) => ({ id: row.id, kind: "Sale bill", party: row.party, date: row.date, detail: null, amt: row.amt ?? 0, due: unpaid(row.amt, row.paid), href: `/sales/${row.id}` })),
      repairs.map((row) => ({ id: row.id, kind: "Repair", party: row.party, date: row.date, detail: row.detail, amt: row.amt ?? 0, due: unpaid(row.amt, row.paid), href: `/repairs/${row.id}` })),
      goldLoans.map((row) => ({
        id: row.id, kind: "Gold loan", party: row.party, date: row.date, detail: words(row.item, row.weight !== null && `(${grams(row.weight)})`),
        amt: row.amt ?? 0, due: unpaid(row.amt, row.paid), href: `/gold-loans/${row.id}`,
      })),
      returns.map((row) => ({ id: row.id, kind: "Supplier return", party: row.party, date: row.date, detail: "Piece sent back", amt: row.amt ?? 0, due: unpaid(row.amt, row.paid), href: `/inventory/${row.piece}` })),
    ],
    loans.map((row) => ({ id: row.id, kind: "Loan", party: row.party, date: row.date, detail: null, amt: row.amt, due: round2(row.due), href: `/loans/given/${row.id}` })),
  );

  const owing = outstanding(
    [
      bills.map((row) => ({ id: row.id, kind: "Purchase bill", party: row.party, date: row.date, detail: words(row.metal, payBy(row.dueDate)), amt: row.amt ?? 0, due: unpaid(row.amt, row.paid), href: `/purchases/${row.id}` })),
      oldItems.map((row) => ({
        id: row.id, kind: "Old metal", party: row.party, date: row.date, detail: words(row.metal, row.weight !== null && grams(row.weight)),
        amt: row.amt ?? 0, due: unpaid(row.amt, row.paid), href: `/old-gold/${row.id}`,
      })),
      misc.map((row) => ({ id: row.id, kind: "Misc purchase", party: row.party, date: row.date, detail: words(row.qty, row.unit, row.item, payBy(row.dueDate)), amt: row.amt ?? 0, due: unpaid(row.amt, row.paid), href: "/misc" })),
    ],
    lends.map((row) => ({ id: row.id, kind: "Borrowing", party: row.party, date: row.date, detail: null, amt: row.amt, due: round2(row.due), href: `/loans/taken/${row.id}` })),
  );

  return { owed, owing };
}
