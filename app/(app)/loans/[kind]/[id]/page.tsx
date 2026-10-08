import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { addLoanEntry } from "@/app/actions/loans";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, ModeField, PageHeader, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateTime, inr } from "@/lib/format";
import { round2 } from "@/lib/pricing";

// One person's running account of plain cash: `given` is what the shop lent them, `taken` what
// the shop borrowed from them. Every movement is listed with what was left after it.
const KINDS = {
  given: { kind: "loan" as const, first: { value: "given", label: "Give more" }, repay: "Repayment received", advanced: "Lent in all", repaid: "Repaid", left: "Owes the shop", subtitle: "Money the shop lent" },
  taken: { kind: "lend" as const, first: { value: "taken", label: "Borrow more" }, repay: "Repay the borrowing", advanced: "Borrowed in all", repaid: "Repaid", left: "Shop owes", subtitle: "Money the shop borrowed" },
};

export default async function LoanAccountPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await getCurrentUser();
  const { kind, id } = await params;
  if ((kind !== "given" && kind !== "taken") || !isUuid(id)) notFound();
  const words = KINDS[kind];

  const [account] = kind === "given"
    ? await db.select({ person: entity.id, name: entity.name, contact: entity.contact }).from(loan).innerJoin(entity, eq(loan.borrower, entity.id)).where(eq(loan.id, id))
    : await db.select({ person: entity.id, name: entity.name, contact: entity.contact }).from(lend).innerJoin(entity, eq(lend.lender, entity.id)).where(eq(lend.id, id));
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DataTable
            head={["Time", "Entry", "Mode", "Amount", "Left after it"]}
            right={[3, 4]}
            empty="No entries yet."
            rows={[...lines].reverse().map(({ entry, repayment, balance: after }) => [
              <span key="t" className="whitespace-nowrap">{dateTime(entry.date)}</span>,
              <span key="e" className="capitalize">{entry.type}</span>,
              <span key="m" className="capitalize">{entry.mode}</span>,
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
            <DateField />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
