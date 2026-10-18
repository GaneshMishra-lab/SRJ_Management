"use server";

import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity, miscItem } from "@/db/schema/entities";
import { listBcs } from "@/lib/bc";
import { miscTrade } from "@/db/schema/ledger";
import { bill, goldLoan, itemOrder, itemRepairing, itemSaleBill } from "@/db/schema/sales";
import { purchaseFormData, saleFormData } from "@/lib/bill-forms";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, inr, istDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";

// What the day book's popup needs to choose from when it makes one of the app's own records:
// the people the app knows, and the open bills, loans, orders and repairs money can be put against.
// Fetched when such a form is first opened, not with the page.

export type Choice = { id: string; label: string; metal?: "gold" | "silver" }; // the metal, where the head asks for one
export type FormLists = {
  people: { id: string; name: string; type: string | null }[];
  loans: Choice[];
  sales: Choice[];
  bills: Choice[];
  orders: Choice[];
  repairs: Choice[];
  items: Choice[];
  miscDue: Choice[]; // misc purchases bought on credit and not yet paid for
  bcs: Choice[]; // BCs still taking instalments
};

const due = (total: number | null, paid: number | null) => round2((total ?? 0) - (paid ?? 0));
const parts = (...words: (string | null | undefined)[]) => words.filter(Boolean).join(" · ");

// What the sale bill form chooses from, at the rates of the bill's own day.
export async function loadSaleForm(day: string) {
  await getCurrentUser();
  const today = istDate();
  const { rates, ...lists } = await saleFormData(/^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today ? day : today);
  return { ...lists, rates: { Gold: rates.Gold?.rate ?? null, Silver: rates.Silver?.rate ?? null } };
}

export async function loadPurchaseForm() {
  await getCurrentUser();
  return purchaseFormData();
}

export async function loadFormLists(): Promise<FormLists> {
  await getCurrentUser();

  const [people, loans, sales, bills, orders, repairs, items, miscDue, bcs] = await Promise.all([
    db.select({ id: entity.id, name: entity.name, type: entity.type }).from(entity).orderBy(asc(entity.name)),
    db.select({ loan: goldLoan, name: entity.name })
      .from(goldLoan)
      .leftJoin(entity, eq(goldLoan.customer, entity.id))
      .where(eq(goldLoan.status, "active"))
      .orderBy(desc(goldLoan.date)),
    db.select({ bill: itemSaleBill, name: entity.name })
      .from(itemSaleBill)
      .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
      .where(and(isNull(itemSaleBill.cancelledAt), sql`coalesce(${itemSaleBill.totalAmt}, 0) > coalesce(${itemSaleBill.paidAmt}, 0)`))
      .orderBy(desc(itemSaleBill.date)),
    db.select({ bill, name: entity.name })
      .from(bill)
      .leftJoin(entity, eq(bill.supplier, entity.id))
      .where(sql`coalesce(${bill.billAmt}, 0) > coalesce(${bill.paidAmt}, 0)`)
      .orderBy(desc(bill.date)),
    db.select({ order: itemOrder, name: entity.name })
      .from(itemOrder)
      .leftJoin(entity, eq(itemOrder.customer, entity.id))
      .where(ne(itemOrder.status, "dispatched"))
      .orderBy(desc(itemOrder.date)),
    db.select({ repair: itemRepairing, name: entity.name })
      .from(itemRepairing)
      .leftJoin(entity, eq(itemRepairing.customer, entity.id))
      .where(sql`coalesce(${itemRepairing.amt}, 0) > coalesce(${itemRepairing.paidAmt}, 0)`)
      .orderBy(desc(itemRepairing.receivedDate)),
    db.select().from(miscItem).orderBy(asc(miscItem.name)),
    db.select({ trade: miscTrade, item: miscItem.name, name: entity.name })
      .from(miscTrade)
      .leftJoin(miscItem, eq(miscTrade.item, miscItem.id))
      .leftJoin(entity, eq(miscTrade.entity, entity.id))
      .where(and(eq(miscTrade.type, "purchase"), sql`coalesce(${miscTrade.amt}, 0) > coalesce(${miscTrade.paidAmt}, 0)`))
      .orderBy(desc(miscTrade.date)),
    listBcs(),
  ]);

  return {
    people: people.flatMap((person) => (person.name ? [{ ...person, name: person.name }] : [])),
    loans: loans.map(({ loan, name }) => ({ id: loan.id, label: parts(name, loan.item, inr(due(loan.amt, loan.amtPaid))) })),
    sales: sales.map(({ bill: sale, name }) => ({ id: sale.id, label: parts(name, dateOnly(sale.date), inr(due(sale.totalAmt, sale.paidAmt))) })),
    bills: bills.map(({ bill: owed, name }) => ({
      id: owed.id,
      label: parts(name, dateOnly(owed.date), owed.metal, inr(due(owed.billAmt, owed.paidAmt))),
      metal: owed.metal === "Silver" ? "silver" as const : "gold" as const,
    })),
    orders: orders.map(({ order, name }) => ({ id: order.id, label: parts(order.name, name, order.metal) })),
    repairs: repairs.map(({ repair, name }) => ({ id: repair.id, label: parts(name, repair.desc, inr(due(repair.amt, repair.paidAmt))) })),
    items: items.map((item) => ({ id: item.id, label: parts(item.name, item.unit) })),
    miscDue: miscDue.map(({ trade, item, name }) => ({ id: trade.id, label: parts(name, item, dateOnly(trade.date), inr(due(trade.amt, trade.paidAmt))) })),
    bcs: bcs
      .filter((row) => !row.maturedAt && row.left > 0)
      .map((row) => ({ id: row.id, label: parts(row.name, row.cardNo ? `#${row.cardNo}` : null, `${inr(row.instalment)} × ${row.months}`, `${row.monthsPaid}/${row.months}`) })),
  };
}
