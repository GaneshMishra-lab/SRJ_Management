import { auditTimestamps, pgTable, pgView, rupees, text, timestamp, uuid } from "./shared";
import { sql } from "drizzle-orm";

import { entity } from "./entities";

// loan: cash the shop gave. One running account per entity.
export const loan = pgTable("loan", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  borrower: uuid("borrower").notNull().unique().references(() => entity.id),
});

export const loanEntry = pgTable("loan_entry", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  loan: uuid("loan").notNull().references(() => loan.id),
  date: timestamp("date", { mode: "string" }),
  type: text("type"), // given, repayment
  amt: rupees("amt"),
  mode: text("mode"),
});

// lend: cash the shop took. One running account per entity.
export const lend = pgTable("lend", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  lender: uuid("lender").notNull().unique().references(() => entity.id),
});

export const lendEntry = pgTable("lend_entry", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  lend: uuid("lend").notNull().references(() => lend.id),
  date: timestamp("date", { mode: "string" }),
  type: text("type"), // taken, repayment
  amt: rupees("amt"),
  mode: text("mode"),
});

// Per-entity dues, one column per source. The first five are owed to the shop,
// the last three are owed by the shop. Gold loan interest is not included.
export const entityBalance = pgView("entity_balance", {
  entity: uuid("entity"),
  name: text("name"),
  type: text("type"),
  saleDue: rupees("sale_due"),
  repairDue: rupees("repair_due"),
  loanDue: rupees("loan_due"),
  goldLoanPrincipalDue: rupees("gold_loan_principal_due"),
  supplierReturnDue: rupees("supplier_return_due"),
  billDue: rupees("bill_due"),
  lendDue: rupees("lend_due"),
  oldItemDue: rupees("old_item_due"),
}).as(sql`
  select
    e.id as entity,
    e.name,
    e.type,
    coalesce((select sum(coalesce(s.total_amt, 0) - coalesce(s.paid_amt, 0)) from item_sale_bill s where s.customer = e.id and s.cancelled_at is null), 0) as sale_due,
    coalesce((select sum(coalesce(r.amt, 0) - coalesce(r.paid_amt, 0)) from item_repairing r where r.customer = e.id), 0) as repair_due,
    coalesce((select sum(case when le.type = 'repayment' then -le.amt else le.amt end) from loan l join loan_entry le on le.loan = l.id where l.borrower = e.id), 0) as loan_due,
    coalesce((select sum(coalesce(g.amt, 0) - coalesce(g.amt_paid, 0)) from gold_loan g where g.customer = e.id and g.status = 'active'), 0) as gold_loan_principal_due,
    coalesce((select sum(coalesce(sr.amt, 0)) from supplier_return sr where sr.supplier = e.id), 0)
      - coalesce((select sum(coalesce(st.amt, 0)) from supplier_return sr join supplier_return_settlement st on st.supplier_return = sr.id where sr.supplier = e.id), 0) as supplier_return_due,
    coalesce((select sum(coalesce(b.bill_amt, 0) - coalesce(b.paid_amt, 0)) from bill b where b.supplier = e.id), 0) as bill_due,
    coalesce((select sum(case when le.type = 'repayment' then -le.amt else le.amt end) from lend l join lend_entry le on le.lend = l.id where l.lender = e.id), 0) as lend_due,
    coalesce((select sum(coalesce(o.amt, 0) - coalesce(o.paid_amt, 0)) from old_item o where o.customer = e.id and o.sale_bill is null and o."order" is null and o.gold_loan is null), 0) as old_item_due
  from entity e
`);
