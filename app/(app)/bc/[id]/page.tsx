import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { bc, bcPayment } from "@/db/schema/finance";
import { itemSaleBill, itemSaleDetails } from "@/db/schema/sales";
import { addBcPayment, deleteBcPayment, matureBc, undoBcMaturity } from "@/app/actions/bc";
import { ActionForm } from "@/components/ActionForm";
import { RemoveButton } from "@/components/controls";
import { Card, DataTable, DateField, Notice, ModeField, PageHeader, Rupees, Stats, StatusBadge } from "@/components/ui";
import { bcFigures, dueOn, type BcStatus } from "@/lib/bc";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, inr, istDate } from "@/lib/format";
import { mayCorrect } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";
import { btn, linkClass } from "@/lib/styles";

const STATUS: Record<BcStatus, { label: string; tone: "warn" | "accent" | "ok" | "neutral" }> = {
  running: { label: "Running", tone: "warn" },
  to_mature: { label: "Term over", tone: "accent" },
  ready: { label: "Matured", tone: "ok" },
  used: { label: "Used up", tone: "neutral" },
};

export default async function BcAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [found] = await db
    .select({ bc, name: entity.name, contact: entity.contact })
    .from(bc)
    .innerJoin(entity, eq(bc.customer, entity.id))
    .where(eq(bc.id, id));
  if (!found) notFound();
  const row = found.bc;

  const [payments, bills] = await Promise.all([
    db.select().from(bcPayment).where(eq(bcPayment.bc, id)).orderBy(asc(bcPayment.date), asc(bcPayment.createdAt)),
    db.select({ id: itemSaleBill.id, date: itemSaleBill.date, total: itemSaleBill.totalAmt, cancelledAt: itemSaleBill.cancelledAt, amt: itemSaleDetails.amtPaid })
      .from(itemSaleDetails)
      .innerJoin(itemSaleBill, eq(itemSaleDetails.sale, itemSaleBill.id))
      .where(and(eq(itemSaleDetails.bc, id), eq(itemSaleDetails.mode, "bc")))
      .orderBy(asc(itemSaleBill.date)),
  ]);

  const paid = round2(payments.reduce((total, payment) => total + (payment.amt ?? 0), 0));
  const spent = round2(bills.filter((sale) => !sale.cancelledAt).reduce((total, sale) => total + (sale.amt ?? 0), 0));
  const today = istDate();
  const f = bcFigures(row, paid, spent, today);
  const matured = Boolean(row.maturedAt);

  // Money paid is put against the instalments in order, the oldest first.
  const schedule = Array.from({ length: row.months }, (_, i) => {
    const on = dueOn(row, i + 1);
    const covered = round2(Math.min(row.instalment, Math.max(0, paid - i * row.instalment)));
    const state = covered >= row.instalment ? "paid" : covered > 0 ? "part" : on <= today ? "overdue" : "coming";
    return { n: i + 1, on, covered, state };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/bc", label: "BC" }}
        title={<>{found.name ?? "Unknown"} <StatusBadge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</StatusBadge></>}
        subtitle={[
          row.cardNo ? `Card ${row.cardNo}` : null,
          `${inr(row.instalment)} a month for ${row.months} months, from ${dateOnly(row.startDate)}`,
          found.contact,
        ].filter(Boolean).join(" · ")}
      >
        {f.status === "ready" && <Link href="/sales/new" className={btn()}>New sale</Link>}
      </PageHeader>

      <Stats items={matured
        ? [
          { name: "Paid in", value: inr(f.paid), note: `${f.monthsPaid} of ${row.months} instalments` },
          { name: "Bonus", value: inr(row.bonus), note: row.bonus ? undefined : "Not given" },
          { name: "Used on bills", value: inr(f.spent) },
          { name: "Left to buy against", value: inr(f.balance), tone: f.balance > 0 ? "ok" : undefined },
        ]
        : [
          { name: "Paid in", value: inr(f.paid), note: `${f.monthsPaid} of ${row.months} instalments` },
          { name: "Overdue", value: inr(f.arrears), note: f.monthsDue > 0 ? `${f.monthsDue} month${f.monthsDue > 1 ? "s" : ""}` : "Nothing overdue", tone: f.arrears > 0 ? "bad" : undefined },
          { name: "Left to pay", value: inr(f.left) },
          { name: "Worth when paid in full", value: inr(f.term + f.fullBonus), note: `Usable from ${dateOnly(f.maturesOn)}` },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DataTable
            head={["Instalment", "Falls due", "Paid", "State"]}
            right={[2]}
            empty="No instalments."
            rows={schedule.map((line) => [
              `${line.n} of ${row.months}`,
              <span key="d" className="whitespace-nowrap">{dateOnly(line.on)}</span>,
              line.covered > 0 ? inr(line.covered) : "-",
              line.state === "paid" ? <StatusBadge key="s" tone="ok">Paid</StatusBadge>
                : line.state === "part" ? <StatusBadge key="s" tone="warn">Part paid</StatusBadge>
                : line.state === "overdue" ? <StatusBadge key="s" tone="bad">Overdue</StatusBadge>
                : <span key="s" className="text-fg-3">Not yet due</span>,
            ])}
          />

          <Card title="Payments" hint={`${inr(paid)} paid in all`} flush>
            {payments.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-fg-3">No instalments yet.</p>
            ) : (
              <ul>
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-fg capitalize">{payment.mode === "opening" ? "Paid before the app" : payment.mode}</p>
                      <p className="text-[13px] text-fg-3">{dateTime(payment.date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-sm text-fg tabular-nums">{inr(payment.amt)}</span>
                      {!matured && mayCorrect(user.role, payment.date) && (
                        <RemoveButton action={deleteBcPayment.bind(null, payment.id)} label="Remove this instalment" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {bills.length > 0 && (
            <Card title="Used on bills" flush>
              <ul>
                {bills.map((sale, index) => (
                  <li key={`${sale.id}-${index}`} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/sales/${sale.id}`} className={`text-sm ${linkClass}`}>Sale bill of {dateOnly(sale.date)}</Link>
                      <p className="text-[13px] text-fg-3">
                        Bill total {inr(sale.total)}{sale.cancelledAt ? ` · cancelled ${dateOnly(sale.cancelledAt)}, so it is back on the BC` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm tabular-nums ${sale.cancelledAt ? "text-fg-3 line-through" : "text-fg"}`}>{inr(sale.amt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {!matured && f.left > 0 && (
            <Card title="Record an instalment">
              <ActionForm action={addBcPayment.bind(null, id)} submitLabel="Record">
                <Rupees label="Amount (₹)" name="amt" defaultValue={Math.min(row.instalment, f.left)} max={f.left} required />
                <ModeField label="Cash or online" />
                <DateField />
              </ActionForm>
            </Card>
          )}

          {f.status === "to_mature" && (
            <Card title="Mature this BC" hint="Fixes what the customer can buy against. After this no more instalments are taken.">
              <ActionForm action={matureBc.bind(null, id)} submitLabel="Mature">
                {f.left > 0 && (
                  <Notice tone="warn">
                    {inr(f.left)} of the {inr(f.term)} was never paid{f.monthsDue > 0 ? ` (${f.monthsDue} instalment${f.monthsDue > 1 ? "s" : ""})` : ""}.
                    Take it first if the customer is paying it now.
                  </Notice>
                )}
                <label className="flex items-start gap-2 text-sm text-fg-2">
                  <input type="checkbox" name="bonus" defaultChecked={f.left === 0} className="mt-0.5 h-4 w-4 accent-accent" />
                  <span>Give the bonus of {inr(f.fullBonus)}</span>
                </label>
                <p className="text-[13px] text-fg-3">
                  Worth {inr(f.paid + f.fullBonus)} with the bonus, {inr(f.paid)} without.
                </p>
              </ActionForm>
            </Card>
          )}

          {matured && f.spent === 0 && mayCorrect(user.role, row.maturedAt) && (
            <Card title="Undo the maturity" hint="For a BC matured by mistake, or with the wrong bonus. It takes instalments again and can be matured afresh.">
              <ActionForm action={undoBcMaturity.bind(null, id)} submitLabel="Undo maturity" tone="secondary" />
            </Card>
          )}

          {f.status === "ready" && (
            <Notice tone="info">
              Matured on {dateOnly(row.maturedAt)}. On a new sale bill for {found.name ?? "this customer"}, the BC shows beside the payment.
            </Notice>
          )}
          {f.status === "running" && (
            <Notice tone="info">It can be used from {dateOnly(f.maturesOn)}, when its term has run.</Notice>
          )}
          {row.note && <Notice tone="info">{row.note}</Notice>}
        </div>
      </div>
    </div>
  );
}
