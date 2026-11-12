import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { editLoanEntry } from "@/app/actions/loans";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, Field, Notice, PageHeader, Rupees, SelectField } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateTime, inr, istDate, istTime, parseDbDate } from "@/lib/format";
import { isTypedLoanEntry, mayCorrect } from "@/lib/ledger";

// Correct one line of a loan or सावकारी account typed by mistake: the wrong side (given instead of
// repaid), amount, cash or online, day or note. Saved in place, with its cash ledger entry, so
// the day book of that day reads as if it had been typed right.
const WORDS = {
  given: { first: { value: "given", label: "Loan given" }, repay: "Repayment received", subtitle: "Money the shop lent" },
  taken: { first: { value: "taken", label: "Borrowed (held for them)" }, repay: "Repaid to them", subtitle: "Money the shop borrowed, or holds (सावकारी)" },
};

export default async function EditLoanEntryPage({ params }: { params: Promise<{ kind: string; id: string; entryId: string }> }) {
  const user = await getCurrentUser();
  const { kind, id, entryId } = await params;
  if ((kind !== "given" && kind !== "taken") || !isUuid(id) || !isUuid(entryId)) notFound();
  const words = WORDS[kind];

  const [found] = kind === "given"
    ? await db.select({ entry: loanEntry, name: entity.name }).from(loanEntry).innerJoin(loan, eq(loanEntry.loan, loan.id)).innerJoin(entity, eq(loan.borrower, entity.id))
      .where(and(eq(loanEntry.id, entryId), eq(loanEntry.loan, id)))
    : await db.select({ entry: lendEntry, name: entity.name }).from(lendEntry).innerJoin(lend, eq(lendEntry.lend, lend.id)).innerJoin(entity, eq(lend.lender, entity.id))
      .where(and(eq(lendEntry.id, entryId), eq(lendEntry.lend, id)));
  if (!found) notFound();
  const { entry, name } = found;
  const back = { href: `/loans/${kind}/${id}`, label: name ?? "Account" };
  const header = <PageHeader title="Correct an entry" subtitle={`${name ?? "Unknown"} · ${words.subtitle}`} back={back} />;

  if (!isTypedLoanEntry(entry.mode)) {
    return <div className="space-y-6">{header}<Notice tone="bad">This line was written by a sale bill or a BC. Correct it from that bill or BC.</Notice></div>;
  }
  if (!mayCorrect(user.role, entry.date)) {
    return <div className="space-y-6">{header}<Notice tone="bad">This entry is of {dateTime(entry.date)}. Only the owner can correct an entry of an earlier day.</Notice></div>;
  }

  const when = entry.date ? parseDbDate(entry.date) : null;
  const opening = entry.mode === "opening";

  return (
    <div className="space-y-6">
      {header}
      <Card title="As entered" hint={`${entry.type === "repayment" ? words.repay : words.first.label} · ${inr(entry.amt)} · ${opening ? "owed before the app" : entry.mode} · ${dateTime(entry.date)}`}>
        <ActionForm action={editLoanEntry.bind(null, kind, entryId)} submitLabel="Save correction" className="max-w-xl space-y-4">
          <SelectField label="Entry" name="type" defaultValue={entry.type === "repayment" ? "repayment" : words.first.value} options={[words.first, { value: "repayment", label: words.repay }]} />
          <Rupees label="Amount (₹)" name="amt" required defaultValue={entry.amt ?? undefined} />
          {opening
            ? <p className="text-sm text-fg-3">Owed before the app was used: no cash moves for this line.</p>
            : <SelectField label="Cash or online" name="mode" defaultValue={entry.mode ?? "cash"} options={[{ value: "cash", label: "Cash (Vault)" }, { value: "online", label: "Online (Bank)" }]} />}
          <Field label="Note (optional)" name="note" type="text" defaultValue={entry.note ?? ""} />
          <DateField label="Date" day={when ? istDate(when) : undefined} clock={when ? istTime(when).slice(0, 5) : undefined} />
          <p className="text-[13px] text-fg-3">The cash book and day book of that day change with it. The old entry is kept in the audit log.</p>
        </ActionForm>
      </Card>
    </div>
  );
}
