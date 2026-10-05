import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { cashLedger, dailyBalance } from "@/db/schema/ledger";
import { addExpense, adjustCash, closeDay, transferCash } from "@/app/actions/ledger";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, Empty, Field, ModeField, Notice, PageHeader, Rupees, SelectField, Stats, SummaryRow } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, dateTime, inr, istDate, istDayRange } from "@/lib/format";
import { cashBalances, CashLocation } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";
import { btn, inputClass, rowClass, tableWrapClass, tdClass, thClass } from "@/lib/styles";

const locations: { key: CashLocation; name: string }[] = [
  { key: "vault", name: "Cash in Vault" },
  { key: "account", name: "Bank Account" },
];
const expenseCategories = ["Rent", "Salary", "Electricity", "Tea", "Transport", "Misc"];

export default async function LedgersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();

  const today = istDate();
  const requested = (await searchParams).date;
  const day = typeof requested === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  const { start, end } = istDayRange(day);

  const current = await cashBalances();
  const opening = await cashBalances(start);
  const closing = await cashBalances(end);

  const entries = await db
    .select()
    .from(cashLedger)
    .where(and(gte(cashLedger.date, start), lt(cashLedger.date, end)))
    .orderBy(desc(cashLedger.date), desc(cashLedger.createdAt));

  const closings = await db.select().from(dailyBalance).where(eq(dailyBalance.date, start));

  const dayTotal = (location: CashLocation, direction: "in" | "out") =>
    entries
      .filter((entry) => entry.location === location && entry.direction === direction)
      .reduce((sum, entry) => sum + (entry.amt ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Cash Ledger" subtitle="Every rupee in and out of the vault and the bank account.">
        <form method="get" className="flex items-center gap-2">
          <input name="date" type="date" defaultValue={day} max={today} aria-label="Day to show" className={`${inputClass} w-44`} />
          <button type="submit" className={btn("secondary")}>Show day</button>
        </form>
      </PageHeader>

      <Stats items={locations.map((location) => ({ name: `${location.name} now`, value: inr(current[location.key]) }))} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card title="Add expense">
          <ActionForm action={addExpense} submitLabel="Record expense">
            <SelectField label="Category" name="category" options={expenseCategories} />
            <Field label="Description (optional)" name="desc" type="text" />
            <Rupees label="Amount (₹)" name="amt" required />
            <ModeField label="Paid from" />
            <DateField />
          </ActionForm>
        </Card>

        <Card title="Move money">
          <ActionForm action={transferCash} submitLabel="Record transfer">
            <SelectField
              label="Direction"
              name="from"
              options={[{ value: "vault", label: "Vault → Bank (deposit)" }, { value: "account", label: "Bank → Vault (withdrawal)" }]}
            />
            <Rupees label="Amount (₹)" name="amt" required />
            <DateField />
          </ActionForm>
        </Card>

        {user.role === "owner" && (
          <Card title="Adjustment" hint="Opening balances and corrections. Owner only.">
            <ActionForm action={adjustCash} submitLabel="Record adjustment">
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Where" name="location" options={[{ value: "vault", label: "Vault" }, { value: "account", label: "Bank" }]} />
                <SelectField label="Type" name="direction" options={[{ value: "in", label: "Add" }, { value: "out", label: "Remove" }]} />
              </div>
              <Rupees label="Amount (₹)" name="amt" required />
              <Field label="Reason" name="desc" type="text" placeholder="e.g. Opening balance" required />
            </ActionForm>
          </Card>
        )}
      </div>

      <h2 className="pt-4 font-serif text-[1.375rem] font-medium text-fg">{day === today ? "Today" : dateOnly(day)}</h2>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {locations.map((location) => {
          const saved = closings.find((row) => row.location === location.key);
          // Entries dated to this day after it was counted move the ledger closing, so compare afresh.
          const difference = saved ? round2((saved.actualClosing ?? 0) - closing[location.key]) : 0;
          const movedSince = saved && round2((saved.computedClosing ?? 0) - closing[location.key]) !== 0;
          return (
            <Card key={location.key} title={location.name}>
              <dl className="space-y-2">
                <SummaryRow label="Opening" value={inr(opening[location.key])} />
                <SummaryRow label="Money in" value={`+ ${inr(dayTotal(location.key, "in"))}`} tone="ok" />
                <SummaryRow label="Money out" value={`− ${inr(dayTotal(location.key, "out"))}`} />
                <SummaryRow label="Closing by ledger" value={inr(closing[location.key])} strong />
                {saved && (
                  <>
                    <SummaryRow label="Counted closing" value={inr(saved.actualClosing)} />
                    <SummaryRow label="Difference" value={inr(difference)} tone={difference === 0 ? "ok" : "bad"} />
                  </>
                )}
              </dl>
              {saved?.remarks && <p className="mt-3 text-[13px] text-fg-3">{saved.remarks}</p>}
              {movedSince && (
                <div className="mt-4">
                  <Notice tone="warn">
                    Entries were dated to this day or earlier after it was counted; the ledger closing was {inr(saved.computedClosing)} then.
                  </Notice>
                </div>
              )}

              <div className="mt-5 border-t border-line pt-5">
                <ActionForm action={closeDay} submitLabel={saved ? "Update closing" : "Save closing"} tone="secondary">
                  <input type="hidden" name="date" value={day} />
                  <input type="hidden" name="location" value={location.key} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Counted closing (₹)" name="actual" type="number" step="0.01" min="0" required />
                    <Field label="Remarks (optional)" name="remarks" type="text" />
                  </div>
                </ActionForm>
              </div>
            </Card>
          );
        })}
      </div>

      <div className={tableWrapClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-fg-2">
            <thead>
              <tr>
                <th className={thClass}>Time</th>
                <th className={thClass}>Where</th>
                <th className={thClass}>Details</th>
                <th className={`${thClass} text-right`}>In</th>
                <th className={`${thClass} text-right`}>Out</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={5}><Empty>No cash movement on {dateOnly(day)}.</Empty></td></tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className={rowClass}>
                    <td className={tdClass}>{dateTime(entry.date)}</td>
                    <td className={tdClass}>{entry.location === "vault" ? "Vault" : "Bank"}</td>
                    <td className="px-5 py-3 text-fg">{entry.desc}</td>
                    <td className={`${tdClass} text-right text-ok tabular-nums`}>{entry.direction === "in" ? inr(entry.amt) : ""}</td>
                    <td className={`${tdClass} text-right text-fg tabular-nums`}>{entry.direction === "out" ? inr(entry.amt) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
