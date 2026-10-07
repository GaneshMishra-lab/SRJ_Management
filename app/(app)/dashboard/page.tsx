import Link from "next/link";
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity, miscItem } from "@/db/schema/entities";
import { cashLedger, miscTrade } from "@/db/schema/ledger";
import { bill, itemSaleBill, itemStock } from "@/db/schema/sales";
import { setDailyRates } from "@/app/actions/ledger";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, Empty, PageHeader, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dueDateFrom, dueStatus } from "@/lib/due";
import { round2 } from "@/lib/pricing";
import { dateOnly, dateTime, grams, inr, istDate, istDayRange } from "@/lib/format";
import { cashBalances, getCurrentRates } from "@/lib/ledger";
import { btn, hintClass, inputClass, labelClass, linkClass } from "@/lib/styles";

// "Good morning" by the shop's clock, not the server's.
function greeting() {
  const hour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await getCurrentUser();

  const today = istDate();
  const { start, end } = istDayRange(today);
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

  // What is owed to suppliers and is overdue, or falls due within the week.
  const soon = dueDateFrom(today, 7);
  const owedBills = await db
    .select({ id: bill.id, dueDate: bill.dueDate, total: bill.billAmt, paid: bill.paidAmt, what: bill.metal, supplier: entity.name })
    .from(bill)
    .leftJoin(entity, eq(bill.supplier, entity.id))
    .where(and(lte(bill.dueDate, soon), sql`coalesce(${bill.billAmt}, 0) > coalesce(${bill.paidAmt}, 0)`));
  const owedMisc = await db
    .select({ id: miscTrade.id, dueDate: miscTrade.dueDate, total: miscTrade.amt, paid: miscTrade.paidAmt, what: miscItem.name, supplier: entity.name })
    .from(miscTrade)
    .leftJoin(miscItem, eq(miscTrade.item, miscItem.id))
    .leftJoin(entity, eq(miscTrade.entity, entity.id))
    .where(and(eq(miscTrade.type, "purchase"), lte(miscTrade.dueDate, soon), sql`coalesce(${miscTrade.amt}, 0) > coalesce(${miscTrade.paidAmt}, 0)`));
  const dues = [
    ...owedBills.map((row) => ({ ...row, what: `${row.what ?? ""} bill`.trim(), href: `/purchases/${row.id}` })),
    ...owedMisc.map((row) => ({ ...row, href: "/misc" })),
  ]
    .map((row) => {
      const balance = round2((row.total ?? 0) - (row.paid ?? 0));
      return { ...row, balance, credit: dueStatus(row.dueDate, balance, today) };
    })
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const recent = await db.select().from(cashLedger).orderBy(desc(cashLedger.date), desc(cashLedger.createdAt)).limit(8);

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting()}, ${user.name.split(/\s+/)[0]}`} subtitle={`${dateOnly(today)} · where the shop stands right now`}>
        <Link href="/purchases/new" className={btn("secondary")}>New purchase</Link>
        <Link href="/sales/new" className={btn()}>New sale</Link>
      </PageHeader>

      <Stats items={[
        { name: "Cash in vault", value: inr(balances.vault), note: "By the cash ledger" },
        { name: "Bank balance", value: inr(balances.account), note: "By the cash ledger" },
        { name: "Gold in stock", value: grams(gold?.weight), note: `${gold?.pieces ?? 0} pieces · silver ${grams(silver?.weight)} in ${silver?.pieces ?? 0}` },
        { name: "Today's sales", value: inr(todaySales?.total), note: `${todaySales?.bills ?? 0} ${todaySales?.bills === 1 ? "bill" : "bills"}` },
      ]} />

      {dues.length > 0 && (
        <Card
          title="Supplier dues"
          hint={`Overdue, or to be paid within 7 days. ${inr(dues.reduce((sum, row) => sum + row.balance, 0))} in all.`}
          action={<Link href="/purchases" className={`text-sm ${linkClass}`}>Purchases</Link>}
          flush
        >
          <ul>
            {dues.map((row) => (
              <li key={row.id} className="border-t border-line">
                <Link href={row.href} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-fg/3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{row.supplier ?? "Unknown supplier"} <span className="text-fg-3">· {row.what}</span></p>
                    <p className="text-[13px] text-fg-3">By {dateOnly(row.dueDate)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {row.credit && <StatusBadge tone={row.credit.tone}>{row.credit.label}</StatusBadge>}
                    <span className="text-sm text-fg tabular-nums">{inr(row.balance)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <Card
          title="Recent transactions"
          action={<Link href="/ledgers" className={`text-sm ${linkClass}`}>Cash ledger</Link>}
          flush
          className="lg:col-span-3"
        >
          {recent.length === 0 ? (
            <Empty>No money has moved yet.</Empty>
          ) : (
            <ul>
              {recent.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{entry.desc}</p>
                    <p className="text-[13px] text-fg-3">{dateTime(entry.date)} · {entry.location === "vault" ? "Vault" : "Bank"}</p>
                  </div>
                  <span className={`shrink-0 text-sm tabular-nums ${entry.direction === "in" ? "text-ok" : "text-fg"}`}>
                    {entry.direction === "in" ? "+" : "−"} {inr(entry.amt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Today's rates" hint="Per gram of fine metal. Until today's is entered, the last rate applies." className="lg:col-span-2">
          <ActionForm action={setDailyRates} submitLabel="Save rates">
            <div className="grid grid-cols-2 gap-4">
              {(["Gold", "Silver"] as const).map((metal) => {
                const rate = rates[metal];
                return (
                  <div key={metal} className="space-y-1.5">
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
                    <p className={rate?.isToday ? "text-[13px] text-ok" : hintClass}>
                      {!rate ? "Never entered" : rate.isToday ? "Entered today" : `Using ${inr(rate.rate)} from ${dateOnly(rate.date)}`}
                    </p>
                  </div>
                );
              })}
            </div>
            <DateField label="For a missed day, pick its date" className="" time={false} />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
