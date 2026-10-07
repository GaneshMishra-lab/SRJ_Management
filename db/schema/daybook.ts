import { sql } from "drizzle-orm";
import { jsonb } from "drizzle-orm/pg-core";
import { auditTimestamps, boolean, check, grams, integer, pct, pgTable, rupees, text, timestamp, uniqueIndex, uuid } from "./shared";

// The day book (rojmel) is the cash ledger drawn the way the shop's handwritten book is kept:
// account heads down two sides, जमा and नावे. These tables hold only what the ledger does not.

// An account head (खाते). `role` marks the two the book treats specially: the cash brought
// forward from the day before, and the shop's bank account.
export const daybookHead = pgTable(
  "daybook_head",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    nameMr: text("name_mr").notNull(),
    nameEn: text("name_en").notNull(),
    side: text("side").notNull(), // credit (जमा), debit (नावे)
    sortOrder: integer("sort_order").notNull(),
    page: integer("page").default(1).notNull(), // which sheet of the day it is written on
    role: text("role"), // opening, bank
    active: boolean("active").default(true).notNull(),
    partyRequired: boolean("party_required").default(false).notNull(),
    showRate: boolean("show_rate").default(false).notNull(), // asks for purity and rate per gram
    extraFields: jsonb("extra_fields")
      .$type<{ key: string; labelMr: string; labelEn: string; type: "text" | "number"; required?: boolean }[]>()
      .default([])
      .notNull(),
  },
  (table) => ({
    sideCheck: check("daybook_head_side_check", sql`${table.side} in ('credit', 'debit')`),
    roleCheck: check("daybook_head_role_check", sql`${table.role} in ('opening', 'bank')`),
    pageCheck: check("daybook_head_page_check", sql`${table.page} in (1, 2)`),
    // At most one head of each role on a side.
    roleSideUnique: uniqueIndex("daybook_head_role_side_uq").on(table.role, table.side),
  }),
);

// Which head each kind of app entry is written under. The kinds are listed in lib/daybook/kinds.ts.
export const daybookRule = pgTable("daybook_rule", {
  ...auditTimestamps(),
  kind: text("kind").primaryKey(),
  head: uuid("head").notNull().references(() => daybookHead.id),
});

// A line typed straight into the day book, for money no other screen records. Like every other
// cash-moving table, each row has its entry in cash_ledger.
export const daybookEntry = pgTable(
  "daybook_entry",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    date: timestamp("date", { mode: "string" }).notNull(),
    head: uuid("head").notNull().references(() => daybookHead.id),
    party: text("party"),
    weight: grams("weight"),
    purity: pct("purity"),
    rate: rupees("rate"), // per gram
    amt: rupees("amt").notNull(),
    mode: text("mode").notNull(), // cash, upi, cheque, bank
    note: text("note"),
    extraData: jsonb("extra_data").$type<Record<string, string>>().default({}).notNull(),
  },
  (table) => ({
    amtCheck: check("daybook_entry_amt_check", sql`${table.amt} > 0`),
    modeCheck: check("daybook_entry_mode_check", sql`${table.mode} in ('cash', 'upi', 'cheque', 'bank')`),
  }),
);

// A single row: what is written at the top of the first sheet.
export const daybookSettings = pgTable(
  "daybook_settings",
  {
    id: integer("id").default(1).primaryKey(),
    invocation: text("invocation").notNull(),
    showInvocation: boolean("show_invocation").default(true).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    singleRow: check("daybook_settings_single_row", sql`${table.id} = 1`),
  }),
);
