import "server-only";
import { and, asc, eq, gte, inArray, lt, or, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/db";
import { daybookEntry, daybookHead, daybookRule, daybookSettings } from "@/db/schema/daybook";
import { entity, miscItem } from "@/db/schema/entities";
import { bc, bcPayment, lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { cashLedger, expense, miscTrade, miscTradePayment } from "@/db/schema/ledger";
import {
  bill, billPayment, fineTrade, goldLoan, goldLoanPayment, itemOrder, itemOrderPayment, itemRepairing, itemRepairingPayment,
  itemSale, itemSaleBill, itemSaleDetails, itemStock, itemType, langdiLedger, oldItem, oldItemPayment, supplierReturn, supplierReturnSettlement,
} from "@/db/schema/sales";
import { istDate, istDayRange, parseDbDate } from "@/lib/format";
import { cashBalances } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";
import { project, tally } from "./calc";
import { DEFAULT_INVOCATION } from "./i18n";
import { KINDS } from "./kinds";
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
  const [rows, heads] = await Promise.all([
    db.select().from(daybookRule),
    db.select({ id: daybookHead.id, side: daybookHead.side, nameEn: daybookHead.nameEn }).from(daybookHead),
  ]);
  const rules = new Map(rows.map((row) => [row.kind, row.head]));
  // A kind no head has been chosen for yet goes under its usual one.
  for (const kind of KINDS) {
    const usual = rules.has(kind.key) ? undefined : heads.find((head) => head.side === kind.head.side && head.nameEn === kind.head.nameEn);
    if (usual) rules.set(kind.key, usual.id);
  }
  return rules;
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
  // The money is already told by other lines of the day (a sale bill's own), so it is not written
  // again; only its passing through the bank is.
  written?: boolean;
};
type Found = Map<string, Detail>;

const metalOf = (metal: string | null) => (metal === "Silver" ? "silver" : "gold"); // phuli is low-purity gold
const found = <Row extends { id: string }>(rows: Row[], detail: (row: Row) => Detail): Found => new Map(rows.map((row) => [row.id, detail(row)]));
const onDay = (date: string | null, day: string) => Boolean(date) && istDate(parseDbDate(date!)) === day;
const isMoney = (mode: string | null) => mode === "cash" || mode === "online";

// The sale bills made on a day and those cancelled on it, each with its pieces, the old metal
// taken in exchange and everything set against it. These are written on the page whether or not
// money moved: a bill is entered in full, and what is left to pay goes under उधारी.
async function getSales(start: string, end: string) {
  const within = (column: AnyColumn) => and(gte(column, start), lt(column, end));
  const bills = await db
    .select({
      id: itemSaleBill.id, date: itemSaleBill.date, cancelledAt: itemSaleBill.cancelledAt,
      discount: itemSaleBill.discount, totalAmt: itemSaleBill.totalAmt, party: entity.name,
    })
    .from(itemSaleBill)
    .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
    .where(or(within(itemSaleBill.date), within(itemSaleBill.cancelledAt)))
    .orderBy(asc(itemSaleBill.date));
  if (bills.length === 0) return [];

  const ids = bills.map((bill) => bill.id);
  const [pieces, old, settled] = await Promise.all([
    // A loose line (mani) has no stock piece: its weight is on the line and its metal is that of its type.
    db
      .select({
        id: itemSale.id, bill: itemSale.bill, amt: itemSale.amt, looseWeight: itemSale.weight,
        netWeight: itemStock.netWeight, label: itemStock.label, stockMetal: itemStock.metal, name: itemType.name, typeMetal: itemType.metal,
      })
      .from(itemSale)
      .leftJoin(itemStock, eq(itemSale.item, itemStock.id))
      .leftJoin(itemType, sql`${itemType.id} = coalesce(${itemStock.itemType}, ${itemSale.itemType})`)
      .where(inArray(itemSale.bill, ids))
      .orderBy(asc(itemSale.createdAt)),
    db.select({ id: oldItem.id, bill: oldItem.saleBill, metal: oldItem.metal, weight: oldItem.weight, amt: oldItem.amt }).from(oldItem).where(inArray(oldItem.saleBill, ids)),
    db.select({ bill: itemSaleDetails.sale, date: itemSaleDetails.date, amt: itemSaleDetails.amtPaid, mode: itemSaleDetails.mode }).from(itemSaleDetails).where(inArray(itemSaleDetails.sale, ids)),
  ]);
  return bills.map((bill) => ({
    ...bill,
    pieces: pieces.filter((piece) => piece.bill === bill.id).map((piece) => ({ ...piece, metal: metalOf(piece.stockMetal ?? piece.typeMetal) })),
    old: old.filter((item) => item.bill === bill.id),
    settled: settled.filter((row) => row.bill === bill.id),
  }));
}

// One lookup per table that writes to the cash ledger, keyed by the name it writes as its source.
const lookups: Record<string, (ids: string[], day: string) => Promise<Found>> = {
  // Money on a sale bill. On the bill's own day the bill's lines already tell it; on a later day
  // it is the customer paying what was left.
  item_sale_details: async (ids, day) => {
    const rows = await db
      .select({ id: itemSaleDetails.id, bill: itemSaleDetails.sale, billDate: itemSaleBill.date, party: entity.name })
      .from(itemSaleDetails)
      .leftJoin(itemSaleBill, eq(itemSaleDetails.sale, itemSaleBill.id))
      .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
      .where(inArray(itemSaleDetails.id, ids));
    return found(rows, (row) => ({ kind: "sale_due_received", party: row.party, href: `/sales/${row.bill}`, written: onDay(row.billDate, day) }));
  },
  // A cancelled bill: the money given back, which the lines of the cancellation already tell.
  item_sale_bill: async (ids) => {
    const rows = await db
      .select({ id: itemSaleBill.id, party: entity.name })
      .from(itemSaleBill)
      .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
      .where(inArray(itemSaleBill.id, ids));
    return found(rows, (row) => ({ kind: "sale_due_received", party: row.party, tag: "refund", href: `/sales/${row.id}`, written: true }));
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
  bc_payment: async (ids) => {
    const rows = await db
      .select({ id: bcPayment.id, bc: bc.id, cardNo: bc.cardNo, party: entity.name })
      .from(bcPayment)
      .innerJoin(bc, eq(bcPayment.bc, bc.id))
      .leftJoin(entity, eq(bc.customer, entity.id))
      .where(inArray(bcPayment.id, ids));
    return found(rows, (row) => ({ kind: "bc_instalment", party: row.party, note: row.cardNo ? `#${row.cardNo}` : null, href: `/bc/${row.bc}` }));
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
  const [rows, before, after, rules, sales] = await Promise.all([
    db.select().from(cashLedger).where(and(gte(cashLedger.date, start), lt(cashLedger.date, end))).orderBy(asc(cashLedger.date), asc(cashLedger.createdAt)),
    cashBalances(start),
    cashBalances(end),
    getRules(),
    getSales(start, end),
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
      if (detail?.written) {
        // Through the bank, it is written under the bank's head alone, as the second writing of a bank entry is.
        if (bank) {
          entries.push({
            ...entry, flow: flow === "in" ? "out" : "in", bank: false,
            headId: place(bankHead(flow === "in" ? "debit" : "credit"), flow === "in" ? "out" : "in"),
            party: detail.party ?? null, tag: detail.tag ?? null, href: detail.href,
          });
        }
        continue;
      }
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

  // The sale bills. A bill's lines come to exactly the money received on it that day, so the page
  // still closes on the cash in the drawer.
  for (const sale of sales) {
    const sum = (rows: { amt: number | null }[]) => round2(rows.reduce((total, row) => total + (row.amt ?? 0), 0));
    const total = sale.totalAmt ?? 0;
    const advance = sum(sale.settled.filter((row) => row.mode === "order_advance"));
    const fromBc = sum(sale.settled.filter((row) => row.mode === "bc"));
    const money = sale.settled.filter((row) => isMoney(row.mode));
    const unsettled = round2(total - advance - fromBc - sum(sale.old));
    // What is not a piece's own (discount, advance, BC, cancellation) is written under the head of the
    // metal most of the bill's value is in, should a bill ever mix the two.
    const value = (metal: string) => sum(sale.pieces.filter((piece) => piece.metal === metal));
    const billKind = `sale.${value("silver") > value("gold") ? "silver" : "gold"}`;
    const write = (id: string, kind: string, flow: Entry["flow"], amt: number, more: Partial<Entry> = {}) => {
      if (amt <= 0) return;
      entries.push({
        id: `${sale.id}:${id}`, day, headId: place(rules.get(kind), flow), flow, bank: false, amt, party: sale.party, weight: null, purity: null, rate: null,
        note: null, mode: "cash", extra: {}, tag: null, editable: false, source: null, href: `/sales/${sale.id}`, ...more,
      });
    };

    if (onDay(sale.date, day)) {
      for (const piece of sale.pieces) {
        // Written as the book has it: the piece and its label, its weight, then the customer.
        const name = [piece.name, piece.label].filter((part) => part !== null).join("#");
        write(piece.id, `sale.${piece.metal}`, "in", piece.amt ?? 0, { party: name || sale.party, weight: piece.netWeight ?? piece.looseWeight, note: name ? sale.party : null });
      }
      write("discount", billKind, "out", sale.discount ?? 0, { tag: "discount" });
      // An order's advance was written on the day it was taken.
      write("advance", billKind, "out", advance, { tag: "advance" });
      // So were a BC's instalments, under the BC head.
      write("bc", billKind, "out", fromBc, { tag: "bc" });
      // Old metal taken in exchange is old metal bought.
      for (const old of sale.old) write(old.id, `old.${metalOf(old.metal)}`, "out", old.amt ?? 0, { weight: old.weight, href: `/old-gold/${old.id}` });
      write("due", "sale_due", "out", round2(unsettled - sum(money.filter((row) => onDay(row.date, day)))));
    }
    // A cancelled bill is taken back off the page on the day it is cancelled: the sale, the old
    // metal handed back, and whatever the customer still had to pay.
    if (onDay(sale.cancelledAt, day)) {
      write("cancelled", billKind, "out", round2(total - advance - fromBc), { tag: "cancelled" });
      for (const old of sale.old) write(`${old.id}:back`, `old.${metalOf(old.metal)}`, "in", old.amt ?? 0, { weight: old.weight, tag: "refund", href: `/old-gold/${old.id}` });
      write("due:cancelled", "sale_due", "in", round2(unsettled - sum(money)), { tag: "cancelled" });
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
