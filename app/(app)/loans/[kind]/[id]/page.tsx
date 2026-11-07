import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { addLoanEntry, setLoanReminder } from "@/app/actions/loans";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, Field, linkClass, ModeField, PageHeader, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, inr, istDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";

// One person's running account of plain cash: `given` is what the shop lent them, `taken` what
// the shop borrowed from them. Every movement is listed with what was left after it.
const KINDS = {
  given: { kind: "loan" as const, first: { value: "given", label: "Give more" }, repay: "Repayment received", advanced: "Lent in all", repaid: "Repaid", left: "Owes the shop", subtitle: "Money the shop lent" },
  taken: { kind: "lend" as const, first: { value: "taken", label: "Borrow more" }, repay: "Repay the borrowing", advanced: "Borrowed in all", repaid: "Repaid", left: "Shop owes", subtitle: "Money the shop borrowed, or holds for a customer (सावकारी)" },
};

// Lines that moved no cash: money held, spent on a sale bill, and given back when that bill was cancelled.
const ON_A_BILL: Record<string, string> = { sale: "Used on a sale bill", sale_cancel: "Sale bill cancelled, held again" };
const INTO_BC: Record<string, string> = { bc: "Paid into a BC" };

export default async function LoanAccountPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await getCurrentUser();
  const { kind, id } = await params;
  if ((kind !== "given" && kind !== "taken") || !isUuid(id)) notFound();
  const words = KINDS[kind];

  const [account] = kind === "given"
    ? await db.select({ person: entity.id, name: entity.name, contact: entity.contact, remindOn: loan.remindOn }).from(loan).innerJoin(entity, eq(loan.borrower, entity.id)).where(eq(loan.id, id))
    : await db.select({ person: entity.id, name: entity.name, contact: entity.contact, remindOn: lend.remindOn }).from(lend).innerJoin(entity, eq(lend.lender, entity.id)).where(eq(lend.id, id));
  if (!account) notFound();

  const entries = kind === "given"
    ? await db.select().from(loanEntry).where(eq(loanEntry.loan, id)).orderBy(asc(loanEntry.date), asc(loanEntry.createdAt))
    : await db.select().from(lendEntry).where(eq(lendEntry.lend, id)).orderBy(asc(lendEntry.date), asc(lendEntry.createdAt));

  const lines = entries.reduce<{ entry: (typeof entries)[number]; repayment: boolean; balance: number }[]>((done, entry) => {
    const repayment = entry.type === "repayment";
    const before = done.at(-1)?.balance ?? 0;
    return [...done, { entry, repayment, balance: round2(before + (repayment ? -(entry.amt ?? 0) : entry.amt ?? 0)) }];
  }, []);
  const balance = lines.at(-1)?.balance ?? 0;
  const repaid = round2(lines.filter((line) => line.repayment).reduce((sum, line) => sum + (line.entry.amt ?? 0), 0));
  const advanced = round2(balance + repaid);
  const today = istDate();
  const reminderDue = Boolean(account.remindOn && account.remindOn <= today && balance > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/loans", label: "Loans" }}
        title={<>{account.name ?? "Unknown"} <StatusBadge tone={balance > 0 ? "amber" : "emerald"}>{balance > 0 ? "open" : "settled"}</StatusBadge></>}
        subtitle={`${words.subtitle}${account.contact ? ` · ${account.contact}` : ""}`}
      />

      <Stats items={[
        { name: words.advanced, value: inr(advanced) },
        { name: words.repaid, value: inr(repaid) },
        { name: words.left, value: inr(balance) },
      ]} />

      {reminderDue && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-bad/40 bg-bad/8 px-4 py-3">
          <span className="grid h-7 w-7 shrink-0 animate-pulse place-items-center rounded-full bg-bad text-sm font-bold text-white" aria-hidden="true">!</span>
          <p className="text-sm text-fg">
            Reminder {account.remindOn === today ? "today" : `since ${dateOnly(account.remindOn)}`}: {inr(balance)} {kind === "given" ? "still to come from" : "still to pay to"} {account.name ?? "this person"}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DataTable
            head={["Time", "Entry", "Mode", "Amount", "Left after it"]}
            right={[3, 4]}
            empty="No entries yet."
            rows={[...lines].reverse().map(({ entry, repayment, balance: after }) => [
              <span key="t" className="whitespace-nowrap">{dateTime(entry.date)}</span>,
              "sale" in entry && entry.sale && ON_A_BILL[entry.mode ?? ""]
                ? <Link key="e" href={`/sales/${entry.sale}`} className={linkClass}>{ON_A_BILL[entry.mode ?? ""]}</Link>
                : <span key="e"><span className="capitalize">{INTO_BC[entry.mode ?? ""] ?? entry.type}</span>{"note" in entry && entry.note ? <span className="block text-[13px] text-fg-3">{entry.note}</span> : null}</span>,
              <span key="m" className="capitalize">{ON_A_BILL[entry.mode ?? ""] || INTO_BC[entry.mode ?? ""] ? "No cash" : entry.mode}</span>,
              <span key="a" className={repayment ? "text-ok" : "text-fg"}>{repayment ? "−" : "+"} {inr(entry.amt)}</span>,
              inr(after),
            ])}
          />
        </div>

        <Card title="New entry">
          <ActionForm action={addLoanEntry.bind(null, words.kind)} submitLabel="Record">
            <input type="hidden" name="entity" value={account.person} />
            <SelectField label="Entry" name="type" defaultValue={balance > 0 ? "repayment" : words.first.value} options={[words.first, { value: "repayment", label: words.repay }]} />
            <Rupees label="Amount (₹)" name="amt" required />
            <ModeField label="Cash or online" />
            <Field label="Note (optional)" name="note" type="text" />
            <DateField />
          </ActionForm>
        </Card>

        <Card title="Reminder" hint={account.remindOn ? `Set for ${dateOnly(account.remindOn)}.${balance > 0 ? "" : " Nothing is open, so it is not shown."}` : "From this day the account is flagged with a red ! in the sidebar, on the dashboard and on the Loans page, until it is settled."}>
          <ActionForm action={setLoanReminder.bind(null, kind, id)} submitLabel="Save reminder">
            <Field label="Remind on" name="remindOn" type="date" defaultValue={account.remindOn ?? ""} />
            {account.remindOn && (
              <label className="flex items-center gap-2 text-sm text-fg-2">
                <input type="checkbox" name="clear" className="h-4 w-4 accent-accent" /> Clear the reminder
              </label>
            )}
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
