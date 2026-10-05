import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { cashLedger, dailyBalance } from "@/db/schema/ledger";
import { addExpense, adjustCash, closeDay, transferCash } from "@/app/actions/ledger";
import { ActionForm } from "@/components/ActionForm";
import { DateField } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, dateTime, inr, istDate, istDayRange } from "@/lib/format";
import { cashBalances, CashLocation } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";
import { cardClass, inputClass, labelClass, tableWrapClass, theadClass } from "@/lib/styles";

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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Cash Ledger</h1>
        <p className="text-zinc-400 mt-1">Every rupee in and out of the vault and the bank account.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {locations.map((location) => (
          <div key={location.key} className={cardClass}>
            <p className="text-sm font-medium text-zinc-400">{location.name} now</p>
            <p className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">{inr(current[location.key])}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Add expense</h2>
          <ActionForm action={addExpense} submitLabel="Record expense">
            <div className="space-y-2">
              <label htmlFor="exp-category" className={labelClass}>Category</label>
              <select id="exp-category" name="category" className={inputClass}>
                {expenseCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="exp-desc" className={labelClass}>Description (optional)</label>
              <input id="exp-desc" name="desc" type="text" className={inputClass} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="exp-amt" className={labelClass}>Amount (₹)</label>
                <input id="exp-amt" name="amt" type="number" step="0.01" min="0.01" className={inputClass} required />
              </div>
              <div className="space-y-2">
                <label htmlFor="exp-mode" className={labelClass}>Paid from</label>
                <select id="exp-mode" name="mode" className={inputClass}>
                  <option value="cash">Cash (Vault)</option>
                  <option value="online">Online (Bank)</option>
                </select>
              </div>
            </div>
            <DateField />
          </ActionForm>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Move money</h2>
          <ActionForm action={transferCash} submitLabel="Record transfer">
            <div className="space-y-2">
              <label htmlFor="tr-from" className={labelClass}>Direction</label>
              <select id="tr-from" name="from" className={inputClass}>
                <option value="vault">Vault → Bank (deposit)</option>
                <option value="account">Bank → Vault (withdrawal)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="tr-amt" className={labelClass}>Amount (₹)</label>
              <input id="tr-amt" name="amt" type="number" step="0.01" min="0.01" className={inputClass} required />
            </div>
            <DateField />
          </ActionForm>
        </div>

        {user.role === "owner" && (
          <div className={cardClass}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Adjustment</h2>
            <p className="text-sm text-zinc-500 mb-4">Opening balances and corrections. Owner only.</p>
            <ActionForm action={adjustCash} submitLabel="Record adjustment">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="adj-location" className={labelClass}>Where</label>
                  <select id="adj-location" name="location" className={inputClass}>
                    <option value="vault">Vault</option>
                    <option value="account">Bank</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="adj-direction" className={labelClass}>Type</label>
                  <select id="adj-direction" name="direction" className={inputClass}>
                    <option value="in">Add</option>
                    <option value="out">Remove</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="adj-amt" className={labelClass}>Amount (₹)</label>
                <input id="adj-amt" name="amt" type="number" step="0.01" min="0.01" className={inputClass} required />
              </div>
              <div className="space-y-2">
                <label htmlFor="adj-desc" className={labelClass}>Reason</label>
                <input id="adj-desc" name="desc" type="text" placeholder="e.g. Opening balance" className={inputClass} required />
              </div>
            </ActionForm>
          </div>
        )}
      </div>

      <form method="get" className="flex items-end gap-3 pt-4">
        <div className="space-y-2">
          <label htmlFor="date" className={labelClass}>Day</label>
          <input id="date" name="date" type="date" defaultValue={day} max={today} className={inputClass} />
        </div>
        <button type="submit" className="px-5 py-2.5 rounded-xl border border-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-900 transition-colors">
          Show
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {locations.map((location) => {
          const saved = closings.find((row) => row.location === location.key);
          // Entries dated to this day after it was counted move the ledger closing, so compare afresh.
          const difference = saved ? round2((saved.actualClosing ?? 0) - closing[location.key]) : 0;
          const movedSince = saved && round2((saved.computedClosing ?? 0) - closing[location.key]) !== 0;
          return (
            <div key={location.key} className={cardClass}>
              <h2 className="text-lg font-semibold text-zinc-100 mb-4">{location.name} · {dateOnly(day)}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-zinc-400">Opening</dt><dd className="text-zinc-200">{inr(opening[location.key])}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-400">Money in</dt><dd className="text-emerald-400">+ {inr(dayTotal(location.key, "in"))}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-400">Money out</dt><dd className="text-red-400">- {inr(dayTotal(location.key, "out"))}</dd></div>
                <div className="flex justify-between border-t border-zinc-800 pt-2 font-semibold"><dt className="text-zinc-300">Closing by ledger</dt><dd className="text-zinc-100">{inr(closing[location.key])}</dd></div>
                {saved && (
                  <>
                    <div className="flex justify-between"><dt className="text-zinc-400">Counted closing</dt><dd className="text-zinc-200">{inr(saved.actualClosing)}</dd></div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-400">Difference</dt>
                      <dd className={difference === 0 ? "text-emerald-400" : "text-red-400"}>{inr(difference)}</dd>
                    </div>
                    {movedSince && (
                      <p className="text-amber-500">
                        Entries were dated to this day or earlier after it was counted; the ledger closing was {inr(saved.computedClosing)} then.
                      </p>
                    )}
                    {saved.remarks && <p className="text-zinc-500">{saved.remarks}</p>}
                  </>
                )}
              </dl>

              <div className="mt-6 border-t border-zinc-800 pt-4">
                <ActionForm action={closeDay} submitLabel={saved ? "Update closing" : "Save closing"}>
                  <input type="hidden" name="date" value={day} />
                  <input type="hidden" name="location" value={location.key} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor={`actual-${location.key}`} className={labelClass}>Counted closing (₹)</label>
                      <input id={`actual-${location.key}`} name="actual" type="number" step="0.01" min="0" className={inputClass} required />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={`remarks-${location.key}`} className={labelClass}>Remarks (optional)</label>
                      <input id={`remarks-${location.key}`} name="remarks" type="text" className={inputClass} />
                    </div>
                  </div>
                </ActionForm>
              </div>
            </div>
          );
        })}
      </div>

      <div className={tableWrapClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className={theadClass}>
              <tr>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Time</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Where</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Details</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">In</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 sm:px-6 text-center text-zinc-500">
                    No cash movement on {dateOnly(day)}.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">{dateTime(entry.date)}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">{entry.location === "vault" ? "Vault" : "Bank"}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-zinc-200">{entry.desc}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-right text-emerald-400">{entry.direction === "in" ? inr(entry.amt) : ""}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-right text-red-400">{entry.direction === "out" ? inr(entry.amt) : ""}</td>
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
