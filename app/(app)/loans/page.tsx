import Link from "next/link";
import { addLoanEntry } from "@/app/actions/loans";
import { ActionForm } from "@/components/ActionForm";
import { ActionPanels } from "@/components/ActionPanels";
import { TableFilter } from "@/components/TableFilter";
import { DataTable, DateField, EntityFields, Field, linkClass, ModeField, PageHeader, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { asc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { lendEntry, loanEntry } from "@/db/schema/finance";
import { getCurrentUser } from "@/lib/dal";
import { getDues, type Due } from "@/lib/dues";
import { listEntities } from "@/lib/entities";
import { dateOnly, inr, istDate, parseDbDate } from "@/lib/format";

const total = (rows: Due[]) => rows.reduce((sum, row) => sum + row.due, 0);

export default async function LoansPage() {
  await getCurrentUser();

  const [people, dues, contacts, loanEntries, lendEntries] = await Promise.all([
    listEntities(["customer", "supplier", "staff"]),
    getDues(),
    db.select({ name: entity.name, contact: entity.contact }).from(entity).where(isNotNull(entity.contact)),
    db.select({ account: loanEntry.loan, date: loanEntry.date, amt: loanEntry.amt, note: loanEntry.note }).from(loanEntry).orderBy(asc(loanEntry.date)),
    db.select({ account: lendEntry.lend, date: lendEntry.date, amt: lendEntry.amt, note: lendEntry.note }).from(lendEntry).orderBy(asc(lendEntry.date)),
  ]);

  // What the search box reads besides what the row shows: phone, every entry of a plain account
  // (its note, amount and date), and amounts and dates as typed (142114, 01/07/2024, 2024-07-01).
  const typed = (date: string | null | undefined) => {
    if (!date) return "";
    const day = istDate(parseDbDate(date));
    const [y, m, d] = day.split("-");
    return `${day} ${d}/${m}/${y} ${Number(d)}/${Number(m)}/${y.slice(2)}`;
  };
  const phone = new Map(contacts.map((row) => [row.name, row.contact]));
  const entriesOf = new Map<string, string[]>();
  for (const row of [...loanEntries, ...lendEntries]) {
    entriesOf.set(row.account, [...(entriesOf.get(row.account) ?? []), [row.note, row.amt, row.amt && inr(row.amt), typed(row.date)].filter(Boolean).join(" ")]);
  }
  // A row's details (a pledge, a repair, a bill's metal) are shown on the page it opens, not in the
  // table, but the search still finds them.
  const searchText = (row: Due) => [phone.get(row.party), row.detail, ...(entriesOf.get(row.id) ?? []), row.amt, row.due, typed(row.date), typed(row.remindOn)].filter(Boolean).join(" ");
  const today = istDate();
  // A plain account whose reminder day has come while money is still open on it.
  const flagged = (row: Due) => Boolean(row.remindOn && row.remindOn <= today && row.due > 0);

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

      <TableFilter placeholder="Search name, phone, note, amount, date">
      {sections.map((section) => (
        <div key={section.kind} className="space-y-4" data-filter-group>
          <h2 className="font-serif text-[1.375rem] font-medium text-fg">{section.title}</h2>
          <ActionPanels panels={[{
            key: section.kind, label: section.formTitle, title: section.formTitle,
            hint: section.kind === "lend"
              ? "Cash borrowed with nothing else behind it, and money a customer leaves with the shop (not against an order). If the person owes the shop anything (sale bills, a loan, a repair), it pays that first; only the rest is held. A sale bill can later be paid out of what is held."
              : "Cash lent with nothing else behind it. Dues of the other kinds are paid on their own screens: open the line below.",
            children: (
              <ActionForm action={addLoanEntry.bind(null, section.kind)} submitLabel="Record">
                <SelectField label="Entry" name="type" options={[section.first, { value: "repayment", label: section.repay }]} />
                <EntityFields label="Person" entities={people} newLabel="Or a new person" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Rupees label="Amount (₹)" name="amt" required />
                  <ModeField label="Cash or online" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Note (optional)" name="note" type="text" placeholder={section.kind === "lend" ? "e.g. to be used with BC no. 14" : "e.g. Ram wedding"} />
                  <Field label="Remind on (optional)" name="remindOn" type="date" hint="From this day the account is flagged with a red ! until it is settled." />
                </div>
                <DateField />
              </ActionForm>
            ),
          }]} />
          <p data-filter-none hidden className="text-sm text-fg-3">Nothing here matches the search.</p>
          <DataTable
            head={["Person", "Kind", "Date", "Amount", section.owes]}
            right={[3, 4]}
            empty={section.empty}
            rows={section.rows.map((row) => [
              <Link key="p" href={row.href} className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${linkClass}`}>
                {flagged(row) && <span className="grid h-5 w-5 shrink-0 animate-pulse place-items-center rounded-full bg-bad text-[11px] font-bold text-white" title={`Reminder since ${dateOnly(row.remindOn)}`}>!</span>}
                {row.party ?? "Unknown"}
                {row.remindOn && row.due > 0 && (
                  <span className={`text-[12px] font-normal ${flagged(row) ? "font-medium text-bad" : "text-fg-3"}`}>remind {dateOnly(row.remindOn)}</span>
                )}
                <span hidden> {searchText(row)}</span>
              </Link>,
              <StatusBadge key="k" tone={row.kind === section.plain ? "accent" : "neutral"}>{row.kind}</StatusBadge>,
              <span key="d" className="whitespace-nowrap">{dateOnly(row.date)}</span>,
              inr(row.amt),
              row.due > 0 ? <span key="o" className="font-medium text-fg">{inr(row.due)}</span> : <span key="o" className="text-fg-3">Settled</span>,
            ])}
          />
        </div>
      ))}
      </TableFilter>
    </div>
  );
}
