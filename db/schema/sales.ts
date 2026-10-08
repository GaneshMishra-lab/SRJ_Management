import {
  auditTimestamps,
  boolean,
  check,
  date,
  grams,
  integer,
  pct,
  pgTable,
  rupees,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "./shared";
import { sql } from "drizzle-orm";

import { entity } from "./entities";

export const bill = pgTable("bill", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  supplier: uuid("supplier").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  metal: text("metal"), // Gold or Silver, never mixed on one bill
  standard: text("standard"), // 995, 999, 100
  rate: rupees("rate"), // per gram of fine, fixed on the bill date
  billAmt: rupees("bill_amt"),
  fine: grams("fine"),
  paidAmt: rupees("paid_amt"),
  dueDate: date("due_date", { mode: "string" }), // the day the supplier's credit runs out; empty when none was agreed
});

export const itemType =pgTable("item_type", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  metal: text("metal"), // Gold, Silver
  desc: text("desc"),
  nextLabel: integer("next_label").default(1).notNull(),
  // Sold loose by weight (mani), not as labelled pieces: its stock is in loose_stock_ledger.
  loose: boolean("loose").default(false).notNull(),
  piecesPerGram: integer("pieces_per_gram"), // 6 for 1x6; only used to show an approximate count
});

export const billPayment = pgTable("bill_payment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  bill: uuid("bill").references(() => bill.id),
  amt: rupees("amt"), // always rupees; metal modes are valued at the bill rate
  mode: text("mode"), // cash, online, fine, langdi, return_credit
  fineWeight: grams("fine_weight"),
  standard: text("standard"), // standard of the metal given
});

export const itemOrder = pgTable("item_order", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  name: text("name"),
  metal: text("metal"),
  weight: grams("weight"),
  melting: pct("melting"),
  status: text("status"),
  rateBooked: boolean("rate_booked").default(false).notNull(),
  bookedRate: rupees("booked_rate"),
  amt: rupees("amt"),
  amtPaid: rupees("amt_paid"),
});

export const itemOrderPayment = pgTable("item_order_payment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  order: uuid("order").notNull().references(() => itemOrder.id),
  date: timestamp("date", { mode: "string" }),
  amt: rupees("amt"),
  mode: text("mode"),
});

// One physical piece as the supplier billed it. It becomes a piece in the shop (item_stock) only when
// it is labelled; the weights there are the shop's own and may differ from the bill's.
export const itemPurchased = pgTable("item_purchased", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  bill: uuid("bill").references(() => bill.id),
  itemType: uuid("item_type").references(() => itemType.id),
  grossWeight: grams("gross_weight"),
  netWeight: grams("net_weight"),
  melting: pct("melting"),
  wastage: pct("wastage"),
  making: rupees("making"), // per gram of net weight
  extraCharges: rupees("extra_charges"),
  amt: rupees("amt"),
  order: uuid("order").references(() => itemOrder.id),
});

export const goldLoan = pgTable("gold_loan", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  item: text("item"),
  desc: text("desc"),
  weight: grams("weight"),
  date: timestamp("date", { mode: "string" }),
  amt: rupees("amt"),
  amtPaid: rupees("amt_paid"), // principal only
  interest: pct("interest"), // percent per month, simple
  status: text("status").default("active"), // active, closed, defaulted
});

export const goldLoanPayment = pgTable("gold_loan_payment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  loan: uuid("loan").references(() => goldLoan.id),
  date: timestamp("date", { mode: "string" }),
  amt: rupees("amt"),
  type: text("type"),
  mode: text("mode"),
  desc: text("desc"),
});

// Langdi (melted old metal) is tracked by weight; pieces is only a soft count.
// fine = (weight - refining_deduction) × tested_purity ÷ standard received.
export const langdiLedger = pgTable("langdi_ledger", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  metal: text("metal"),
  direction: text("direction"),
  weight: grams("weight"),
  pieces: integer("pieces"),
  estPurity: pct("est_purity"),
  testedPurity: pct("tested_purity"),
  refiningDeduction: grams("refining_deduction"),
  fineWeight: grams("fine_weight"),
  standard: text("standard"),
  sourceTable: text("source_table"), // melt, fine_trade, bill_payment, cash_sale
  sourceId: uuid("source_id"),
  // Filled when langdi is sold for cash.
  entity: uuid("entity").references(() => entity.id),
  amt: rupees("amt"),
  mode: text("mode"),
  desc: text("desc"),
});

export const oldItem = pgTable("old_item", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  weight: grams("weight"),
  metal: text("metal"), // Gold, Silver, Phuli
  amt: rupees("amt"),
  paidAmt: rupees("paid_amt"),
  melting: pct("melting"),
  saleBill: uuid("sale_bill").references(() => itemSaleBill.id),
  order: uuid("order").references(() => itemOrder.id),
  goldLoan: uuid("gold_loan").references(() => goldLoan.id), // defaulted pledge
  status: text("status"), // vault, melted, refurbished, returned (its sale bill was cancelled)
  processedDate: timestamp("processed_date", { mode: "string" }),
  langdiEntry: uuid("langdi_entry").references(() => langdiLedger.id),
});

export const oldItemPayment = pgTable("old_item_payment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  oldItem: uuid("old_item").notNull().references(() => oldItem.id),
  date: timestamp("date", { mode: "string" }),
  amt: rupees("amt"),
  mode: text("mode"),
});

export const itemStock = pgTable(
  "item_stock",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    date: timestamp("date", { mode: "string" }),
    itemType: uuid("item_type").references(() => itemType.id),
    metal: text("metal"),
    grossWeight: grams("gross_weight"),
    netWeight: grams("net_weight"),
    melting: pct("melting"),
    huid: text("huid").unique(),
    label: integer("label"),
    item: uuid("item").references(() => itemPurchased.id),
    status: text("status"), // stock, on_approval, sold, returned_to_supplier, melted
    oldItemSource: uuid("old_item_source").references(() => oldItem.id),
    langdiEntry: uuid("langdi_entry").references(() => langdiLedger.id),
  },
  (table) => ({
    typeLabelUnique: uniqueIndex("item_stock_type_label_uq").on(table.itemType, table.label),
    // A purchased item is labelled only once.
    itemUnique: uniqueIndex("item_stock_item_uq").on(table.item),
    sourceCheck: check(
      "item_stock_source_check",
      sql`(${table.item} is not null and ${table.oldItemSource} is null) or (${table.item} is null and ${table.oldItemSource} is not null)`,
    ),
  }),
);

// Loose metal (mani) is tracked by weight, per item type and melting. What is on hand is the ins
// minus the outs; no balance is stored.
export const looseStockLedger = pgTable(
  "loose_stock_ledger",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    date: timestamp("date", { mode: "string" }),
    itemType: uuid("item_type").notNull().references(() => itemType.id),
    melting: pct("melting"),
    direction: text("direction"), // in, out
    weight: grams("weight"),
    sourceTable: text("source_table"), // item_purchased, item_sale, sale_cancel, stock_check
    sourceId: uuid("source_id"),
    desc: text("desc"),
  },
  (table) => ({
    // A purchased item is added to loose stock only once.
    purchasedUnique: uniqueIndex("loose_stock_purchased_uq").on(table.sourceId).where(sql`${table.sourceTable} = 'item_purchased'`),
  }),
);

export const itemApproval = pgTable("item_approval", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  item: uuid("item").notNull().references(() => itemStock.id),
  entity: uuid("entity").notNull().references(() => entity.id),
  dateOut: timestamp("date_out", { mode: "string" }),
  dateBack: timestamp("date_back", { mode: "string" }),
  outcome: text("outcome"), // returned, sold
  note: text("note"),
});

// The original bill is only referenced; returns are settled separately.
export const supplierReturn = pgTable("supplier_return", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  supplier: uuid("supplier").notNull().references(() => entity.id),
  item: uuid("item").notNull().references(() => itemStock.id),
  bill: uuid("bill").references(() => bill.id),
  amt: rupees("amt"),
  fine: grams("fine"),
});

export const supplierReturnSettlement = pgTable("supplier_return_settlement", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  supplierReturn: uuid("supplier_return").notNull().references(() => supplierReturn.id),
  date: timestamp("date", { mode: "string" }),
  mode: text("mode"), // cash, online, fine, bill_credit
  amt: rupees("amt"),
  fineWeight: grams("fine_weight"),
  standard: text("standard"),
  billPayment: uuid("bill_payment").references(() => billPayment.id), // the return_credit row, for bill_credit
});

export const itemSaleBill = pgTable("item_sale_bill", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  customer: uuid("customer").references(() => entity.id),
  order: uuid("order").references(() => itemOrder.id),
  computedAmt: rupees("computed_amt"),
  discount: rupees("discount"),
  totalAmt: rupees("total_amt"),
  paidAmt: rupees("paid_amt"),
  // Set when the bill is cancelled. The bill and its payments are kept; the money is reversed
  // by new cash ledger entries on the day of cancellation.
  cancelledAt: timestamp("cancelled_at", { mode: "string" }),
  cancelReason: text("cancel_reason"),
});

export const itemSale =pgTable("item_sale", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  item: uuid("item").references(() => itemStock.id),
  // A loose line has no stock piece; it carries the type, melting and weight sold instead.
  itemType: uuid("item_type").references(() => itemType.id),
  weight: grams("weight"),
  melting: pct("melting"),
  bill: uuid("bill").references(() => itemSaleBill.id),
  rate: rupees("rate"), // purity rate used: daily rate × melting ÷ 100
  makingPct: pct("making_pct"), // wastage included
  metalValue: rupees("metal_value"),
  makingAmt: rupees("making_amt"),
  gst: rupees("gst"),
  amt: rupees("amt"),
});

export const itemSaleDetails = pgTable("item_sale_details", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  sale: uuid("sale").references(() => itemSaleBill.id),
  date: timestamp("date", { mode: "string" }),
  amtPaid: rupees("amt_paid"),
  mode: text("mode"), // cash, online, old_item, order_advance
});

export const itemRepairing = pgTable("item_repairing", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  desc: text("desc"),
  receivedDate: timestamp("received_date", { mode: "string" }),
  receivedWeight: grams("received_weight"),
  status: text("status"), // taken, sent for repair, repaired, returned
  karigar: uuid("karigar").references(() => entity.id),
  sentDate: timestamp("sent_date", { mode: "string" }),
  doneDate: timestamp("done_date", { mode: "string" }),
  returnedDate: timestamp("returned_date", { mode: "string" }),
  returnedWeight: grams("returned_weight"),
  amt: rupees("amt"),
  paidAmt: rupees("paid_amt"),
});

export const itemRepairingPayment = pgTable("item_repairing_payment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  repair: uuid("repair").notNull().references(() => itemRepairing.id),
  date: timestamp("date", { mode: "string" }),
  amt: rupees("amt"),
  mode: text("mode"),
});

export const fineTrade = pgTable("fine_trade", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  type: text("type"), // purchase, sale
  entity: uuid("entity").references(() => entity.id),
  metal: text("metal"),
  standard: text("standard"),
  weight: grams("weight"),
  rate: rupees("rate"),
  amt: rupees("amt"),
  mode: text("mode"), // cash, online, langdi
});
