import Link from "next/link";
import {
  Wallet,
  Landmark,
  Scale,
  TrendingUp,
} from "lucide-react";
import { and, desc, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashLedger } from "@/db/schema/ledger";
import { itemSaleBill, itemStock } from "@/db/schema/sales";
import { setDailyRates } from "@/app/actions/ledger";
import { ActionForm } from "@/components/ActionForm";
import { DateField } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, dateTime, grams, inr, istDate, istDayRange } from "@/lib/format";
import { cashBalances, getCurrentRates } from "@/lib/ledger";
import { inputClass, labelClass } from "@/lib/styles";

export default async function Dashboard() {
  await getCurrentUser();

  const { start, end } = istDayRange(istDate());
  const balances = await cashBalances();
  const rates = await getCurrentRates();

  const stock = await db
    .select({
      metal: itemStock.metal,
      pieces: sql<number>`count(*)`.mapWith(Number),
      weight: sql<number>`coalesce(sum(${itemStock.netWeight}), 0)`.mapWith(Number),
    })
    .from(itemStock)
    .where(inArray(itemStock.status, ["stock", "on_approval"]))
    .groupBy(itemStock.metal);
  const gold = stock.find((row) => row.metal === "Gold");
  const silver = stock.find((row) => row.metal === "Silver");

  const [todaySales] = await db
    .select({
      bills: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(${itemSaleBill.totalAmt}), 0)`.mapWith(Number),
    })
    .from(itemSaleBill)
    .where(and(gte(itemSaleBill.date, start), lt(itemSaleBill.date, end), isNull(itemSaleBill.cancelledAt)));

  const recent = await db.select().from(cashLedger).orderBy(desc(cashLedger.date), desc(cashLedger.createdAt)).limit(8);

  const stats = [
    {
      name: "Cash in Vault",
      value: inr(balances.vault),
      note: "By the cash ledger",
      icon: Wallet,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      name: "Bank Balance",
      value: inr(balances.account),
      note: "By the cash ledger",
      icon: Landmark,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      name: "Gold Stock",
      value: grams(gold?.weight),
      note: `${gold?.pieces ?? 0} gold pieces · silver ${grams(silver?.weight)} in ${silver?.pieces ?? 0}`,
      icon: Scale,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      name: "Today's Sales",
      value: inr(todaySales?.total),
      note: `${todaySales?.bills ?? 0} bills`,
      icon: TrendingUp,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Dashboard</h1>
        <p className="text-zinc-400 mt-1">Overview of your jewelry business performance.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 sm:p-6 shadow-sm backdrop-blur-sm transition-all hover:bg-zinc-900/50"
          >
            <div className={`inline-flex p-3 rounded-xl ${stat.bg}`}>
              <stat.icon className={`h-6 w-6 ${stat.color}`} />
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-medium text-zinc-400">{stat.name}</h3>
              <p className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{stat.note}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-100">Recent Transactions</h2>
            <Link href="/ledgers" className="text-sm text-amber-500 hover:text-amber-400">Cash ledger</Link>
          </div>
          {recent.length === 0 ? (
            <div className="text-center text-zinc-500 py-10">
              No recent transactions.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/50 text-sm">
              {recent.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-zinc-200">{entry.desc}</p>
                    <p className="text-xs text-zinc-500">{dateTime(entry.date)} · {entry.location === "vault" ? "Vault" : "Bank"}</p>
                  </div>
                  <span className={`whitespace-nowrap font-medium ${entry.direction === "in" ? "text-emerald-400" : "text-red-400"}`}>
                    {entry.direction === "in" ? "+" : "-"} {inr(entry.amt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">Today&apos;s Rates</h2>
          <p className="text-sm text-zinc-500 mb-4">Per gram of fine metal. Until today&apos;s is entered, the last rate applies.</p>
          <ActionForm action={setDailyRates} submitLabel="Save rates">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(["Gold", "Silver"] as const).map((metal) => {
                const rate = rates[metal];
                return (
                  <div key={metal} className="space-y-2">
                    <label htmlFor={`rate-${metal}`} className={labelClass}>{metal} (₹/g)</label>
                    <input
                      id={`rate-${metal}`}
                      name={metal.toLowerCase()}
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={rate?.isToday ? rate.rate : undefined}
                      className={inputClass}
                    />
                    <p className={`text-xs ${rate?.isToday ? "text-emerald-400" : "text-amber-500"}`}>
                      {!rate ? "Never entered" : rate.isToday ? "Entered today" : `Using ${inr(rate.rate)} from ${dateOnly(rate.date)}`}
                    </p>
                  </div>
                );
              })}
            </div>
            <DateField label="For a missed day, pick its date (today if left empty)" />
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
