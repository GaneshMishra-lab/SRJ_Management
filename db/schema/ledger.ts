import { entity, miscItem } from "../schema";
import { auditTimestamps, date, grams, integer, pgTable, rupees, text, timestamp, uniqueIndex, uuid } from "./shared";

export const cashLedger = pgTable("cash_ledger", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  location: text("location"), // vault, account
  direction: text("direction"),
  amt: rupees("amt"),
  sourceTable: text("source_table"),
  sourceId: uuid("source_id"),
  desc: text("desc"),
});

export const dailyBalance = pgTable(
  "daily_balance",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    date: timestamp("date", { mode: "string" }),
    location: text("location"),
    openingBalance: rupees("opening_balance"),
    computedClosing: rupees("computed_closing"),
    actualClosing: rupees("actual_closing"),
    discrepancy: rupees("discrepancy"),
    remarks: text("remarks"),
  },
  (table) => ({
    dateLocationUnique: uniqueIndex("daily_balance_date_location_uq").on(
      table.date,
      table.location,
    ),
  }),
);

export const dailyMetalBalance = pgTable(
  "daily_metal_balance",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    metal: text("metal").notNull(),
    standard: text("standard").notNull(),
    openingBalance: grams("opening_balance"),
    computedClosing: grams("computed_closing"),
    actualClosing: grams("actual_closing"),
    discrepancy: grams("discrepancy"),
    remarks: text("remarks"),
  },
  (table) => ({
    dateMetalStandardUnique: uniqueIndex("daily_metal_balance_date_metal_standard_uq").on(
      table.date,
      table.metal,
      table.standard,
    ),
  }),
);

// Rate per gram of fine metal. Until today's row exists, the latest earlier one applies.
export const dailyRate = pgTable(
  "daily_rate",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    metal: text("metal").notNull(),
    rate: rupees("rate").notNull(),
  },
  (table) => ({
    dateMetalUnique: uniqueIndex("daily_rate_date_metal_uq").on(table.date, table.metal),
  }),
);

export const expense = pgTable("expense", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  category: text("category"),
  desc: text("desc"),
  amt: rupees("amt"),
  mode: text("mode"),
  location: text("location"),
});

export const miscTrade = pgTable("misc_trade", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  type: text("type"),
  entity: uuid("entity").notNull().references(() => entity.id),
  item: uuid("item").notNull().references(()=> miscItem.id),
  qty: integer("qty"),
  unitPrice: rupees("unit_price"),
  amt: rupees("amt"),
  mode: text("mode"),
});

// Fine metal only, balanced separately per metal and standard.
export const metalLedger = pgTable("metal_ledger", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { mode: "string" }),
  metal: text("metal"),
  standard: text("standard"), // 995, 999
  direction: text("direction"),
  weight: grams("weight"),
  sourceTable: text("source_table"),
  sourceId: uuid("source_id"),
  desc: text("desc"),
});
