import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { addLoanEntry } from "@/app/actions/loans";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, EntityFields, ModeField, PageHeader, Rupees, SelectField } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { dateTime, inr } from "@/lib/format";

export default async function LoansPage() {
  await getCurrentUser();

  const people = await listEntities(["customer", "supplier", "staff"]);

  const given = await db
    .select({
      name: entity.name,
      balance: sql<number>`coalesce(sum(case when ${loanEntry.type} = 'repayment' then -${loanEntry.amt} else ${loanEntry.amt} end), 0)`.mapWith(Number),
    })
    .from(loan)
    .innerJoin(entity, eq(loan.borrower, entity.id))
    .leftJoin(loanEntry, eq(loanEntry.loan, loan.id))
    .groupBy(loan.id, entity.name);

  const taken = await db
    .select({
      name: entity.name,
      balance: sql<number>`coalesce(sum(case when ${lendEntry.type} = 'repayment' then -${lendEntry.amt} else ${lendEntry.amt} end), 0)`.mapWith(Number),
    })
    .from(lend)
    .innerJoin(entity, eq(lend.lender, entity.id))
    .leftJoin(lendEntry, eq(lendEntry.lend, lend.id))
    .groupBy(lend.id, entity.name);

  const givenEntries = await db
    .select({ entry: loanEntry, name: entity.name })
    .from(loanEntry)
    .innerJoin(loan, eq(loanEntry.loan, loan.id))
    .innerJoin(entity, eq(loan.borrower, entity.id))
    .orderBy(desc(loanEntry.date))
    .limit(30);

  const takenEntries = await db
    .select({ entry: lendEntry, name: entity.name })
    .from(lendEntry)
    .innerJoin(lend, eq(lendEntry.lend, lend.id))
    .innerJoin(entity, eq(lend.lender, entity.id))
    .orderBy(desc(lendEntry.date))
    .limit(30);

  const sections = [
    {
      kind: "loan" as const,
      title: "Money the shop gave",
      first: { value: "given", label: "Give a loan" },
      repay: "Repayment received",
      accounts: given,
      entries: givenEntries,
      owes: "Owes the shop",
    },
    {
      kind: "lend" as const,
      title: "Money the shop took",
      first: { value: "taken", label: "Borrow money" },
      repay: "Repay a borrowing",
      accounts: taken,
      entries: takenEntries,
      owes: "Shop owes",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Loans" subtitle="Plain cash lent and borrowed, one running account per person. Bill dues are not counted here." />

      {sections.map((section) => (
        <div key={section.kind} className="space-y-4">
          <h2 className="font-serif text-[1.375rem] font-medium text-fg">{section.title}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="New entry">
              <ActionForm action={addLoanEntry.bind(null, section.kind)} submitLabel="Record">
                <SelectField label="Entry" name="type" options={[section.first, { value: "repayment", label: section.repay }]} />
                <EntityFields label="Person" entities={people} newLabel="Or a new person" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Rupees label="Amount (₹)" name="amt" required />
                  <ModeField label="Cash or online" />
                </div>
                <DateField />
              </ActionForm>
            </Card>
            <DataTable
              head={["Person", section.owes]}
              right={[1]}
              empty="No accounts yet."
              rows={section.accounts.map((account) => [
                <span key="n" className="font-medium text-fg">{account.name}</span>,
                inr(account.balance),
              ])}
            />
          </div>
          <DataTable
            head={["Time", "Person", "Entry", "Mode", "Amount"]}
            right={[4]}
            empty="No entries yet."
            rows={section.entries.map(({ entry, name }) => [
              <span key="t" className="whitespace-nowrap">{dateTime(entry.date)}</span>,
              name,
              <span key="e" className="capitalize">{entry.type}</span>,
              entry.mode,
              inr(entry.amt),
            ])}
          />
        </div>
      ))}
    </div>
  );
}
