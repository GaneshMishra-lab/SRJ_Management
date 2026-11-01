import { auditTimestamps, date, integer, numeric, pgTable, text, uniqueIndex, uuid } from "./shared";
import { users } from "./entities";

// A count kept as a number: pieces for labelled stock, grams for loose metal later.
const quantity = (name: string) => numeric(name, { precision: 12, scale: 3, mode: "number" });

// A stock check, like a dated column of the shop's stock register: one per kind of stock, metal and day.
// Checking again on the same day replaces that day's check. A check never changes the stock itself.
export const stockCheck = pgTable(
  "stock_check",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(), // labelled; later loose, misc
    metal: text("metal").notNull(), // Gold, Silver
    date: date("date", { mode: "string" }).notNull(), // the shop's calendar day
    note: text("note"),
    checkedBy: integer("checked_by").references(() => users.id),
  },
  (table) => ({
    dayUnique: uniqueIndex("stock_check_day_uq").on(table.kind, table.metal, table.date),
  }),
);

// One row of the register on that day. What the book said is kept beside what was counted, so an old
// column still reads the same after later entries change the past.
export const stockCheckLine = pgTable("stock_check_line", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  check: uuid("check").notNull().references(() => stockCheck.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").notNull(), // an item type for labelled stock
  subjectName: text("subject_name").notNull(),
  added: quantity("added"), // since the check before; empty on the first check
  removed: quantity("removed"),
  expected: quantity("expected").notNull(), // the book at the end of the day
  away: quantity("away").notNull(), // in the book but not in the shop: out on approval
  counted: quantity("counted").notNull(),
  locker: quantity("locker").notNull(), // of the counted, how many are in the locker; the rest are on display
});
