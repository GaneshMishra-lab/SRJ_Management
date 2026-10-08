import Link from "next/link";
import { addLoanEntry } from "@/app/actions/loans";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, EntityFields, linkClass, ModeField, PageHeader, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { getDues, type Due } from "@/lib/dues";
import { listEntities } from "@/lib/entities";
import { dateOnly, inr } from "@/lib/format";

const total = (rows: Due[]) => rows.reduce((sum, row) => sum + row.due, 0);

export default async function LoansPage() {
  await getCurrentUser();

  const [people, dues] = await Promise.all([listEntities(["customer", "supplier", "staff"]), getDues()]);

  const sections = [
    {
      kind: "loan" as const,
      title: "Owed to the shop",
      formTitle: "Plain loan",
      first: { value: "given", label: "Give a loan" },
      repay: "Repayment received",
      rows: dues.owed,
      plain: "Loan",
      owes: "Still to come",
      empty: "Nobody owes the shop anything.",
    },
    {
      kind: "lend" as const,
      title: "Owed by the shop",
      formTitle: "Plain borrowing",
      first: { value: "taken", label: "Borrow money" },
      repay: "Repay a borrowing",
      rows: dues.owing,
      plain: "Borrowing",
      owes: "Still to pay",
      empty: "The shop owes nobody anything.",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Loans" subtitle="Everything owed to the shop and by it: plain loans and borrowings, and the unpaid part of bills, repairs and gold loans. Gold loan interest is not included." />

      <Stats items={[
        { name: "Owed to the shop", value: inr(total(dues.owed)), tone: "ok" },
        { name: "Owed by the shop", value: inr(total(dues.owing)), tone: "bad" },
      ]} />

      {sections.map((section) => (
        <div key={section.kind} className="space-y-4">
          <h2 className="font-serif text-[1.375rem] font-medium text-fg">{section.title}</h2>
          <DataTable
            head={["Person", "Kind", "Date", "Details", "Amount", section.owes]}
            right={[4, 5]}
            empty={section.empty}
            rows={section.rows.map((row) => [
              <Link key="p" href={row.href} className={linkClass}>{row.party ?? "Unknown"}</Link>,
              <StatusBadge key="k" tone={row.kind === section.plain ? "accent" : "neutral"}>{row.kind}</StatusBadge>,
              <span key="d" className="whitespace-nowrap">{dateOnly(row.date)}</span>,
              row.detail ?? "-",
              inr(row.amt),
              row.due > 0 ? <span key="o" className="font-medium text-fg">{inr(row.due)}</span> : <span key="o" className="text-fg-3">Settled</span>,
            ])}
          />
          <Card title={section.formTitle} hint="Cash lent or borrowed with nothing else behind it. Dues of the other kinds are paid on their own screens: open the line above.">
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
        </div>
      ))}
    </div>
  );
}
