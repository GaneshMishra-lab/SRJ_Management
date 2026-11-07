import "server-only";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { balanceOf } from "@/lib/dues";
import { istDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";

// Loan and सावकारी accounts whose reminder day has come while money is still open on them. They
// are flagged with a "!" in the sidebar, listed on the dashboard and marked on the Loans page,
// until the account is settled or the reminder is moved or cleared.
export type Reminder = {
  kind: "given" | "taken"; // given: owed to the shop; taken: the shop owes it
  id: string;
  party: string | null;
  remindOn: string;
  due: number;
  href: string;
};

export async function dueReminders(today = istDate()): Promise<Reminder[]> {
  const [loans, lends] = await Promise.all([
    db
      .select({ id: loan.id, party: entity.name, remindOn: loan.remindOn, due: balanceOf(loanEntry.amt, loanEntry.type) })
      .from(loan)
      .innerJoin(entity, eq(loan.borrower, entity.id))
      .leftJoin(loanEntry, eq(loanEntry.loan, loan.id))
      .where(and(isNotNull(loan.remindOn), lte(loan.remindOn, today)))
      .groupBy(loan.id, entity.name),
    db
      .select({ id: lend.id, party: entity.name, remindOn: lend.remindOn, due: balanceOf(lendEntry.amt, lendEntry.type) })
      .from(lend)
      .innerJoin(entity, eq(lend.lender, entity.id))
      .leftJoin(lendEntry, eq(lendEntry.lend, lend.id))
      .where(and(isNotNull(lend.remindOn), lte(lend.remindOn, today)))
      .groupBy(lend.id, entity.name),
  ]);
  return [
    ...loans.map((row) => ({ ...row, kind: "given" as const, href: `/loans/given/${row.id}` })),
    ...lends.map((row) => ({ ...row, kind: "taken" as const, href: `/loans/taken/${row.id}` })),
  ]
    .map((row) => ({ ...row, remindOn: row.remindOn!, due: round2(row.due) }))
    .filter((row) => row.due > 0)
    .sort((a, b) => a.remindOn.localeCompare(b.remindOn));
}
