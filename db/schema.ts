import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  real,
  timestamp,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// NOTE: Enum-like fields are modeled as text for flexibility and easier future growth.

export const entity = pgTable("entity", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  type: text("type"),
  contact: integer("contact"),
});

export const bill = pgTable("bill", {
  id: uuid("id").defaultRandom().primaryKey(),
  supplier: uuid("supplier").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  rate: real("rate"),
  billAmt: real("bill_amt"),
  fine: real("fine"),
  paidAmt: real("paid_amt"),
});

export const billPayment = pgTable("bill_payment", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  bill: uuid("bill").references(() => bill.id),
  amt: real("amt"),
  mode: text("mode"),
});

export const itemOrder = pgTable("item_order", {
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
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  label: integer("label"),
  item: uuid("item").references(() => itemPurchased.id),
  status: text("status"),
  oldItemSource: uuid("old_item_source").references(() => oldItem.id),
});

export const itemSaleBill = pgTable("item_sale_bill", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  customer: uuid("customer").references(() => entity.id),
  totalAmt: integer("total_amt"),
  paidAmt: integer("paid_amt"),
});

export const itemSale = pgTable("item_sale", {
  id: uuid("id").defaultRandom().primaryKey(),
  item: uuid("item").references(() => itemStock.id),
  amt: integer("amt"),
  bill: uuid("bill").references(() => itemSaleBill.id),
});

export const itemSaleDetails = pgTable("item_sale_details", {
  id: uuid("id").defaultRandom().primaryKey(),
  sale: uuid("sale").references(() => itemSaleBill.id),
  date: timestamp("date", { mode: "string" }),
  amtPaid: integer("amt_paid"),
});

export const goldLoan = pgTable("gold_loan", {
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
  id: uuid("id").defaultRandom().primaryKey(),
  loan: uuid("loan").references(() => goldLoan.id),
  date: timestamp("date", { mode: "string" }),
  amt: integer("amt"),
  type: text("type"),
  desc: text("desc"),
});

export const itemRepairing = pgTable("item_repairing", {
  id: uuid("id").defaultRandom().primaryKey(),
  customer: uuid("customer").references(() => entity.id),
  desc: text("desc"),
  status: text("status"),
  amt: integer("amt"),
  paidAmt: integer("paid_amt"),
});

export const loan = pgTable("loan", {
  id: uuid("id").defaultRandom().primaryKey(),
  borrower: uuid("borrower").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  amtBorrowed: integer("amt_borrowed"),
  amtToBePaid: integer("amt_to_be_paid"),
});

export const loanRepayment = pgTable("loan_repayment", {
  id: uuid("id").defaultRandom().primaryKey(),
  loan: uuid("loan").references(() => loan.id),
  repaymentDate: timestamp("data", { mode: "string" }),
  amt: integer("amt"),
  mode: text("mode"),
});

export const lend = pgTable("lend", {
  id: uuid("id").defaultRandom().primaryKey(),
  lender: uuid("lender").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  amtLended: integer("amt_lended"),
  amtToBePaid: integer("amt_to_be_paid"),
});

export const lendRepayment = pgTable("lend_repayment", {
  id: uuid("id").defaultRandom().primaryKey(),
  lend: uuid("lend").references(() => lend.id),
  repaymentDate: timestamp("data", { mode: "string" }),
  amt: integer("amt"),
  mode: text("mode"),
});

export const cashLedger = pgTable("cash_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  location: text("location"),
  direction: text("direction"),
  amt: real("amt"),
  sourceTable: text("source_table"),
  sourceId: uuid("source_id"),
  desc: text("desc"),
});

export const dailyBalance = pgTable(
  "daily_balance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: timestamp("date", { mode: "string" }),
    location: text("location"),
    openingBalance: real("opening_balance"),
    computedClosing: real("computed_closing"),
    actualClosing: real("actual_closing"),
    discrepancy: real("discrepancy"),
    remarks: text("remarks"),
  },
  (table) => ({
    dateLocationUnique: uniqueIndex("daily_balance_date_location_uq").on(
      table.date,
      table.location,
    ),
  }),
);

export const expense = pgTable("expense", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  category: text("category"),
  desc: text("desc"),
  amt: real("amt"),
  mode: text("mode"),
  location: text("location"),
});

export const miscCategory = pgTable("misc_category", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
});

export const miscItem = pgTable("misc_item", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: uuid("category").references(() => miscCategory.id),
  name: text("name"),
  desc: text("desc"),
  unit: text("unit"),
});

export const miscTrade = pgTable("misc_trade", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  type: text("type"),
  entity: uuid("entity").references(() => entity.id),
  item: uuid("item").references(() => miscItem.id),
  qty: integer("qty"),
  unitPrice: real("unit_price"),
  amt: real("amt"),
  mode: text("mode"),
});

export const finePurchase = pgTable("fine_purchase", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  supplier: uuid("supplier").references(() => entity.id),
  metal: text("metal"),
  weight: real("weight"),
  rate: real("rate"),
  amt: real("amt"),
  mode: text("mode"),
});

export const metalLedger = pgTable("metal_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  metal: text("metal"),
  direction: text("direction"),
  weight: real("weight"),
  sourceTable: text("source_table"),
  sourceId: uuid("source_id"),
  desc: text("desc"),
});

// Optional relations helpers (expand as needed in queries).
export const entityRelations = relations(entity, ({ many }) => ({
  bills: many(bill),
  saleBills: many(itemSaleBill),
  orders: many(itemOrder),
  goldLoans: many(goldLoan),
  repairs: many(itemRepairing),
  loans: many(loan),
  lends: many(lend),
  miscTrades: many(miscTrade),
  finePurchases: many(finePurchase),
}));
