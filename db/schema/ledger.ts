import { pgTable, real, text, timestamp, uniqueIndex, uuid, integer } from "./shared";

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

export const miscTrade = pgTable("misc_trade", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  type: text("type"),
  entity: uuid("entity"),
  item: uuid("item"),
  qty: integer("qty"),
  unitPrice: real("unit_price"),
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
