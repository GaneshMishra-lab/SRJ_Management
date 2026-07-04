import {
  auditTimestamps,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "./shared";

import { entity } from "./entities";

export const bill = pgTable("bill", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  supplier: uuid("supplier").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  rate: real("rate"),
  billAmt: real("bill_amt"),
  fine: real("fine"),
  paidAmt: real("paid_amt"),
});

export const billPayment = pgTable("bill_payment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  bill: uuid("bill").references(() => bill.id),
  amt: real("amt"),
  mode: text("mode"),
});

export const itemOrder = pgTable("item_order", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  name: text("name"),
  weight: real("weight"),
  tunch: integer("tunch"),
  status: text("status"),
  amt: integer("amt"),
  amtPaid: integer("amt_paid"),
});

export const itemPurchased = pgTable("item_purchased", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  bill: uuid("bill").references(() => bill.id),
  name: text("name"),
  metal: text("metal"),
  weight: real("weight"),
  melting: real("melting"),
  wastage: real("wastage"),
  making: real("making"),
  extraCharges: real("extra_charges"),
  amt: real("amt"),
  order: uuid("order").references(() => itemOrder.id),
});

export const oldItem = pgTable("old_item", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  weight: real("weight"),
  metal: text("metal"),
  amt: real("amt"),
  paidAmt: real("paid_amt"),
  tunch: real("tunch"),
  saleBill: uuid("sale_bill").references(() => itemSaleBill.id),
  order: uuid("order").references(() => itemOrder.id),
  status: text("status"),
  processedDate: timestamp("processed_date", { mode: "string" }),
});

export const itemStock = pgTable("item_stock", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  label: integer("label"),
  item: uuid("item").references(() => itemPurchased.id),
  status: text("status"),
  oldItemSource: uuid("old_item_source").references(() => oldItem.id),
});

export const itemSaleBill = pgTable("item_sale_bill", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  customer: uuid("customer").references(() => entity.id),
  totalAmt: integer("total_amt"),
  paidAmt: integer("paid_amt"),
});

export const itemSale = pgTable("item_sale", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  item: uuid("item").references(() => itemStock.id),
  amt: integer("amt"),
  bill: uuid("bill").references(() => itemSaleBill.id),
});

export const itemSaleDetails = pgTable("item_sale_details", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  sale: uuid("sale").references(() => itemSaleBill.id),
  date: timestamp("date", { mode: "string" }),
  amtPaid: integer("amt_paid"),
});

export const itemRepairing = pgTable("item_repairing", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  desc: text("desc"),
  status: text("status"),
  amt: integer("amt"),
  paidAmt: integer("paid_amt"),
});

export const goldLoan = pgTable("gold_loan", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  item: text("item"),
  weight: real("weight"),
  date: timestamp("date", { mode: "string" }),
  amt: integer("amt"),
  amtPaid: integer("amt_paid"),
  interest: real("interest"),
});

export const goldLoanPayment = pgTable("gold_loan_payment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  loan: uuid("loan").references(() => goldLoan.id),
  date: timestamp("date", { mode: "string" }),
  amt: integer("amt"),
  type: text("type"),
  desc: text("desc"),
});

export const finePurchase = pgTable("fine_purchase", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  supplier: uuid("supplier").references(() => entity.id),
  metal: text("metal"),
  weight: real("weight"),
  rate: real("rate"),
  amt: real("amt"),
  mode: text("mode"),
});
