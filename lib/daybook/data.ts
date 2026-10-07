import "server-only";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { daybookEntry, daybookHead, daybookRule, daybookSettings } from "@/db/schema/daybook";
import { entity, miscItem } from "@/db/schema/entities";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { cashLedger, expense, miscTrade, miscTradePayment } from "@/db/schema/ledger";
import {
  bill, billPayment, fineTrade, goldLoan, goldLoanPayment, itemOrder, itemOrderPayment, itemRepairing, itemRepairingPayment,
  itemSale, itemSaleBill, itemSaleDetails, itemStock, langdiLedger, oldItem, oldItemPayment, supplierReturn, supplierReturnSettlement,
} from "@/db/schema/sales";
import { istDayRange } from "@/lib/format";
import { cashBalances } from "@/lib/ledger";
import { project, tally } from "./calc";
import { DEFAULT_INVOCATION } from "./i18n";
import type { Entry, Head, PayMode, Side, Source, Tag } from "./types";

// The day book is read from the cash ledger: every entry any screen makes there is written under
// a head. This file does the reading; nothing here changes anything.

export async function getHeads(): Promise<Head[]> {
  const rows = await db.select().from(daybookHead).orderBy(asc(daybookHead.side), asc(daybookHead.sortOrder));
  return rows.map((row) => ({
    id: row.id,
    nameMr: row.nameMr,
    nameEn: row.nameEn,
    side: row.side === "debit" ? "debit" : "credit",
    sortOrder: row.sortOrder,
    page: row.page === 2 ? 2 : 1,
    role: row.role === "opening" || row.role === "bank" ? row.role : null,
    active: row.active,
    partyRequired: row.partyRequired,
    showRate: row.showRate,
    extraFields: row.extraFields,
  }));
}

export async function getSettings() {
  const [row] = await db.select().from(daybookSettings).where(eq(daybookSettings.id, 1));
  return { invocation: row?.invocation ?? DEFAULT_INVOCATION, showInvocation: row?.showInvocation ?? true };
}

// Which head each kind of app entry is written under.
export async function getRules() {
  const rows = await db.select().from(daybookRule);
  return new Map(rows.map((row) => [row.kind, row.head]));
}

// Names to offer while a party is typed: everyone the app knows, and names typed here before.
export async function getParties() {
  const [people, typed] = await Promise.all([
    db.select({ name: entity.name }).from(entity),
    db.selectDistinct({ name: daybookEntry.party }).from(daybookEntry),
  ]);
  const names = [...typed, ...people].map((row) => row.name?.trim()).filter((name): name is string => Boolean(name));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

// What a ledger entry was for, looked up from the record that caused it. A kind that depends on
// which way the money went is given both ways.
type Detail = {
  kind: string | { in: string; out: string };
  party?: string | null;
  weight?: number | null;
  note?: string | null;
  tag?: Tag;
  href: string;
  source?: Source;
};
type Found = Map<string, Detail>;

const metalOf = (metal: string | null) => (metal === "Silver" ? "silver" : "gold"); // phuli is low-purity gold
const found = <Row extends { id: string }>(rows: Row[], detail: (row: Row) => Detail): Found => new Map(rows.map((row) => [row.id, detail(row)]));

// The metal of a sale bill: the one most of its value is in, should a bill ever mix the two.
async function saleMetals(billIds: string[]) {
  const metals = new Map<string, "gold" | "silver">();
  if (billIds.length === 0) return metals;
  const value = sql<number>`coalesce(sum(${itemSale.amt}), 0)`;
  const rows = await db
    .select({ bill: itemSale.bill, metal: itemStock.metal })
    .from(itemSale)
    .leftJoin(itemStock, eq(itemSale.item, itemStock.id))
    .where(inArray(itemSale.bill, billIds))
    .groupBy(itemSale.bill, itemStock.metal)
    .orderBy(asc(value));
  for (const row of rows) if (row.bill) metals.set(row.bill, metalOf(row.metal)); // the largest comes last
  return metals;
}

// One lookup per table that writes to the cash ledger, keyed by the name it writes as its source.
const lookups: Record<string, (ids: string[], day: string) => Promise<Found>> = {
  item_sale_details: async (ids) => {
    const rows = await db
      .select({ id: itemSaleDetails.id, bill: itemSaleDetails.sale, party: entity.name })
      .from(itemSaleDetails)
      .leftJoin(itemSaleBill, eq(itemSaleDetails.sale, itemSaleBill.id))
      .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
      .where(inArray(itemSaleDetails.id, ids));
    const metals = await saleMetals(rows.flatMap((row) => (row.bill ? [row.bill] : [])));
    return found(rows, (row) => ({ kind: `sale.${metals.get(row.bill ?? "") ?? "gold"}`, party: row.party, href: `/sales/${row.bill}` }));
  },
  // A cancelled bill: the money given back.
  item_sale_bill: async (ids) => {
    const rows = await db
      .select({ id: itemSaleBill.id, party: entity.name })
      .from(itemSaleBill)
      .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
      .where(inArray(itemSaleBill.id, ids));
    const metals = await saleMetals(ids);
    return found(rows, (row) => ({ kind: `sale.${metals.get(row.id) ?? "gold"}`, party: row.party, tag: "refund", href: `/sales/${row.id}` }));
  },
  item_order_payment: async (ids) => {
    const rows = await db
      .select({ id: itemOrderPayment.id, order: itemOrder.id, metal: itemOrder.metal, name: itemOrder.name, party: entity.name })
      .from(itemOrderPayment)
      .innerJoin(itemOrder, eq(itemOrderPayment.order, itemOrder.id))
      .leftJoin(entity, eq(itemOrder.customer, entity.id))
      .where(inArray(itemOrderPayment.id, ids));
    return found(rows, (row) => ({ kind: `order.${metalOf(row.metal)}`, party: row.party, note: row.name, href: `/orders/${row.order}` }));
  },
  item_repairing_payment: async (ids) => {
    const rows = await db
      .select({ id: itemRepairingPayment.id, repair: itemRepairing.id, desc: itemRepairing.desc, party: entity.name })
      .from(itemRepairingPayment)
      .innerJoin(itemRepairing, eq(itemRepairingPayment.repair, itemRepairing.id))
      .leftJoin(entity, eq(itemRepairing.customer, entity.id))
      .where(inArray(itemRepairingPayment.id, ids));
    return found(rows, (row) => ({ kind: "repair", party: row.party, note: row.desc, href: `/repairs/${row.repair}` }));
  },
  bill_payment: async (ids) => {
    const rows = await db
      .select({ id: billPayment.id, bill: bill.id, metal: bill.metal, party: entity.name })
      .from(billPayment)
      .leftJoin(bill, eq(billPayment.bill, bill.id))
      .leftJoin(entity, eq(bill.supplier, entity.id))
      .where(inArray(billPayment.id, ids));
    return found(rows, (row) => ({ kind: `supplier.${metalOf(row.metal)}`, party: row.party, href: `/purchases/${row.bill}` }));
  },
  supplier_return_settlement: async (ids) => {
    const rows = await db
      .select({ id: supplierReturnSettlement.id, piece: supplierReturn.item, metal: itemStock.metal, party: entity.name })
      .from(supplierReturnSettlement)
      .innerJoin(supplierReturn, eq(supplierReturnSettlement.supplierReturn, supplierReturn.id))
      .leftJoin(itemStock, eq(supplierReturn.item, itemStock.id))
      .leftJoin(entity, eq(supplierReturn.supplier, entity.id))
      .where(inArray(supplierReturnSettlement.id, ids));
    return found(rows, (row) => ({ kind: `supplier_return.${metalOf(row.metal)}`, party: row.party, href: `/inventory/${row.piece}` }));
  },
  old_item_payment: async (ids) => {
    const rows = await db
      .select({ id: oldItemPayment.id, old: oldItem.id, metal: oldItem.metal, weight: oldItem.weight, party: entity.name })
      .from(oldItemPayment)
      .innerJoin(oldItem, eq(oldItemPayment.oldItem, oldItem.id))
      .leftJoin(entity, eq(oldItem.customer, entity.id))
      .where(inArray(oldItemPayment.id, ids));
    return found(rows, (row) => ({ kind: `old.${metalOf(row.metal)}`, party: row.party, weight: row.weight, href: `/old-gold/${row.old}` }));
  },
  gold_loan: async (ids) => {
    const rows = await db
      .select({ id: goldLoan.id, item: goldLoan.item, weight: goldLoan.weight, party: entity.name })
      .from(goldLoan)
      .leftJoin(entity, eq(goldLoan.customer, entity.id))
      .where(inArray(goldLoan.id, ids));
    return found(rows, (row) => ({ kind: "girvi_given", party: row.party, weight: row.weight, note: row.item, href: `/gold-loans/${row.id}` }));
  },
  gold_loan_payment: async (ids) => {
    const rows = await db
      .select({ id: goldLoanPayment.id, loan: goldLoanPayment.loan, type: goldLoanPayment.type, party: entity.name })
      .from(goldLoanPayment)
      .leftJoin(goldLoan, eq(goldLoanPayment.loan, goldLoan.id))
      .leftJoin(entity, eq(goldLoan.customer, entity.id))
      .where(inArray(goldLoanPayment.id, ids));
    return found(rows, (row) => ({ kind: "girvi_received", party: row.party, tag: row.type === "principal" ? "principal" : "interest", href: `/gold-loans/${row.loan}` }));
  },
  loan_entry: async (ids) => {
    const rows = await db
      .select({ id: loanEntry.id, party: entity.name })
      .from(loanEntry)
      .innerJoin(loan, eq(loanEntry.loan, loan.id))
      .leftJoin(entity, eq(loan.borrower, entity.id))
      .where(inArray(loanEntry.id, ids));
    return found(rows, (row) => ({ kind: { in: "loan_repaid", out: "loan_given" }, party: row.party, href: "/loans" }));
  },
  lend_entry: async (ids) => {
    const rows = await db
      .select({ id: lendEntry.id, party: entity.name })
      .from(lendEntry)
      .innerJoin(lend, eq(lendEntry.lend, lend.id))
      .leftJoin(entity, eq(lend.lender, entity.id))
      .where(inArray(lendEntry.id, ids));
    return found(rows, (row) => ({ kind: { in: "borrow_taken", out: "borrow_repaid" }, party: row.party, href: "/loans" }));
  },
  expense: async (ids, day) => {
    const rows = await db.select().from(expense).where(inArray(expense.id, ids));
    return found(rows, (row) => ({
      kind: "expense",
      party: [row.category, row.desc].filter(Boolean).join(" - "),
      href: `/ledgers?date=${day}`,
      source: { form: "expense", id: row.id, values: { category: row.category ?? "", desc: row.desc ?? "", amt: String(row.amt ?? ""), mode: row.mode ?? "cash" } },
    }));
  },
  misc_trade: async (ids) => {
    const rows = await db
      .select({ id: miscTrade.id, qty: miscTrade.qty, item: miscItem.name, unit: miscItem.unit, party: entity.name })
      .from(miscTrade)
      .leftJoin(miscItem, eq(miscTrade.item, miscItem.id))
      .leftJoin(entity, eq(miscTrade.entity, entity.id))
      .where(inArray(miscTrade.id, ids));
    return found(rows, (row) => ({
      kind: { in: "misc_sale", out: "misc_purchase" },
      party: row.party,
      note: [row.qty, row.unit, row.item].filter(Boolean).join(" "),
      href: "/misc",
    }));
  },
  // Paying later for a misc purchase bought on credit.
  misc_trade_payment: async (ids) => {
    const rows = await db
      .select({ id: miscTradePayment.id, qty: miscTrade.qty, item: miscItem.name, unit: miscItem.unit, party: entity.name })
      .from(miscTradePayment)
      .innerJoin(miscTrade, eq(miscTradePayment.trade, miscTrade.id))
      .leftJoin(miscItem, eq(miscTrade.item, miscItem.id))
      .leftJoin(entity, eq(miscTrade.entity, entity.id))
      .where(inArray(miscTradePayment.id, ids));
    return found(rows, (row) => ({ kind: "misc_purchase", party: row.party, note: [row.qty, row.unit, row.item].filter(Boolean).join(" "), href: "/misc" }));
  },
  fine_trade: async (ids) => {
    const rows = await db
      .select({ id: fineTrade.id, metal: fineTrade.metal, standard: fineTrade.standard, weight: fineTrade.weight, party: entity.name })
      .from(fineTrade)
      .leftJoin(entity, eq(fineTrade.entity, entity.id))
      .where(inArray(fineTrade.id, ids));
    return found(rows, (row) => ({
      kind: { in: `bullion_sell.${metalOf(row.metal)}`, out: `bullion_buy.${metalOf(row.metal)}` },
      party: row.party,
      weight: row.weight,
      note: row.standard,
      href: "/metal",
    }));
  },
  langdi_ledger: async (ids) => {
    const rows = await db
      .select({ id: langdiLedger.id, metal: langdiLedger.metal, weight: langdiLedger.weight, party: entity.name })
      .from(langdiLedger)
      .leftJoin(entity, eq(langdiLedger.entity, entity.id))
      .where(inArray(langdiLedger.id, ids));
    return found(rows, (row) => ({ kind: `langdi.${metalOf(row.metal)}`, party: row.party, weight: row.weight, href: "/metal" }));
  },
};

// A head for entries no rule places, so that nothing in the ledger is ever left off the page.
const unassigned = (side: Side, page: 1 | 2): Head => ({
  id: `unassigned-${side}`,
  nameMr: "खाते ठरवा",
  nameEn: "Unassigned",
  side,
  sortOrder: Number.MAX_SAFE_INTEGER,
  page,
  role: null,
  active: false,
  partyRequired: false,
  showRate: false,
  extraFields: [],
});

// One day of the book: its entries, the cash brought forward, and where cash and bank stand at its end.
export async function getDay(day: string, heads: Head[]) {
  const { start, end } = istDayRange(day);
  const [rows, before, after, rules] = await Promise.all([
    db.select().from(cashLedger).where(and(gte(cashLedger.date, start), lt(cashLedger.date, end))).orderBy(asc(cashLedger.date), asc(cashLedger.createdAt)),
    cashBalances(start),
    cashBalances(end),
    getRules(),
  ]);

  const idsBy = new Map<string, string[]>();
  for (const row of rows) {
    if (row.sourceTable && row.sourceId) idsBy.set(row.sourceTable, [...(idsBy.get(row.sourceTable) ?? []), row.sourceId]);
  }
  const typedIds = idsBy.get("daybook_entry") ?? [];
  const [typedRows, ...looked] = await Promise.all([
    typedIds.length > 0 ? db.select().from(daybookEntry).where(inArray(daybookEntry.id, typedIds)) : [],
    ...Object.entries(lookups).map(async ([table, lookup]) => [table, idsBy.has(table) ? await lookup(idsBy.get(table)!, day) : new Map()] as const),
  ]);
  const typed = new Map(typedRows.map((row) => [row.id, row]));
  const details = new Map<string, Found>(looked);

  const known = new Set(heads.map((head) => head.id));
  const bankHead = (side: Side) => heads.find((head) => head.role === "bank" && head.side === side)?.id;
  const lastPage = heads.some((head) => head.active && head.page === 2) ? 2 : 1;
  const extra = new Map<Side, Head>();
  // The head an entry goes under, or the stand-in on its side when no head is known for it.
  const place = (headId: string | undefined, flow: "in" | "out") => {
    if (headId && known.has(headId)) return headId;
    const side: Side = flow === "in" ? "credit" : "debit";
    if (!extra.has(side)) extra.set(side, unassigned(side, lastPage));
    return extra.get(side)!.id;
  };

  const entries: Entry[] = [];
  for (const row of rows) {
    const flow: Entry["flow"] | null = row.direction === "in" ? "in" : row.direction === "out" ? "out" : null;
    if (!flow || !row.amt) continue;
    const bank = row.location === "account";
    const mode: PayMode = bank ? "online" : "cash";
    const ledgerHref = `/ledgers?date=${day}`;
    const entry = { id: row.id, day, flow, bank, amt: row.amt, weight: null, purity: null, rate: null, note: null, mode, extra: {}, tag: null, editable: false, source: null };

    const line = row.sourceTable === "daybook_entry" && row.sourceId ? typed.get(row.sourceId) : undefined;
    if (line) {
      entries.push({
        ...entry,
        id: line.id,
        headId: place(line.head, flow),
        party: line.party,
        weight: line.weight,
        purity: line.purity,
        rate: line.rate,
        note: line.note,
        mode: line.mode as PayMode,
        extra: line.extraData,
        editable: true,
        href: null,
      });
    } else if (row.sourceTable === "transfer") {
      // Cash put into or taken out of the bank is one event: it is written once, from the drawer's side.
      if (bank) continue;
      const source: Source | null = row.sourceId ? { form: "transfer", id: row.sourceId, values: { amt: String(row.amt) } } : null;
      entries.push({
        ...entry,
        headId: place(bankHead(flow === "out" ? "debit" : "credit"), flow),
        party: null,
        tag: flow === "out" ? "deposit" : "withdrawal",
        editable: Boolean(source),
        source,
        href: ledgerHref,
      });
    } else if (row.sourceTable === "adjustment") {
      // A correction to the bank balance alone moves no cash, so the cash book does not show it.
      if (bank) continue;
      entries.push({ ...entry, headId: place(rules.get("adjustment"), flow), party: row.desc?.replace(/^Adjustment:\s*/, "") ?? null, tag: "adjustment", href: ledgerHref });
    } else {
      const detail = row.sourceTable && row.sourceId ? details.get(row.sourceTable)?.get(row.sourceId) : undefined;
      const kind = typeof detail?.kind === "string" ? detail.kind : detail?.kind[flow];
      entries.push({
        ...entry,
        headId: place(kind ? rules.get(kind) : undefined, flow),
        party: detail ? detail.party ?? null : row.desc,
        weight: detail?.weight ?? null,
        note: detail?.note ?? null,
        tag: detail?.tag ?? null,
        editable: Boolean(detail?.source),
        source: detail?.source ?? null,
        href: detail?.href ?? ledgerHref,
      });
    }
  }

  const allHeads = [...heads, ...extra.values()];
  // The page must close on the cash the ledger says is in the drawer. If it ever does not, say so loudly.
  const figured = tally(allHeads, project(entries, allHeads), before.vault).closing;
  if (Math.abs(figured - after.vault) > 0.005) {
    console.error(`Day book ${day}: the page closes at ${figured} but the cash ledger at ${after.vault}.`);
  }

  return { heads: allHeads, entries, opening: before.vault, bank: after.account };
}
