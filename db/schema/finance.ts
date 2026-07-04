import { auditTimestamps, integer, pgTable, text, timestamp, uuid } from "./shared";

import { entity } from "./entities";

export const loan = pgTable("loan", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  borrower: uuid("borrower").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  amtBorrowed: integer("amt_borrowed"),
  amtToBePaid: integer("amt_to_be_paid"),
});

export const loanRepayment = pgTable("loan_repayment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  loan: uuid("loan").references(() => loan.id),
  repaymentDate: timestamp("data", { mode: "string" }),
  amt: integer("amt"),
  mode: text("mode"),
});

export const lend = pgTable("lend", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  lender: uuid("lender").references(() => entity.id),
  date: timestamp("date", { mode: "string" }),
  amtLended: integer("amt_lended"),
  amtToBePaid: integer("amt_to_be_paid"),
});

export const lendRepayment = pgTable("lend_repayment", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  lend: uuid("lend").references(() => lend.id),
  repaymentDate: timestamp("data", { mode: "string" }),
  amt: integer("amt"),
  mode: text("mode"),
});
