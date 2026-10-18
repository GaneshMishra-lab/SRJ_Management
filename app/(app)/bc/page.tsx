import Link from "next/link";
import { and, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bcPayment } from "@/db/schema/finance";
import { createBc } from "@/app/actions/bc";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, EntityFields, Field, linkClass, ModeField, PageHeader, Rupees, Stats, StatusBadge } from "@/components/ui";
import { listBcs, type BcListed } from "@/lib/bc";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { dateOnly, inr, istDate, istDayRange } from "@/lib/format";
import { round2 } from "@/lib/pricing";

const sum = (rows: BcListed[], pick: (row: BcListed) => number) => round2(rows.reduce((total, row) => total + pick(row), 0));

const customer = (row: BcListed) => (
  <Link key="c" href={`/bc/${row.id}`} className={linkClass}>{row.name ?? "Unknown"}</Link>
);

export default async function BcPage() {
  await getCurrentUser();

  const today = istDate();
  const { start: monthStart } = istDayRange(`${today.slice(0, 8)}01`);
  const [bcs, people, [{ collected }]] = await Promise.all([
    listBcs(),
    listEntities(["customer"]),
    db.select({ collected: sql<number>`coalesce(sum(${bcPayment.amt}), 0)`.mapWith(Number) })
      .from(bcPayment)
      .where(and(gte(bcPayment.date, monthStart), inArray(bcPayment.mode, ["cash", "online"]))),
  ]);

  const open = bcs.filter((row) => row.status === "running" || row.status === "to_mature");
  const ready = bcs.filter((row) => row.status === "ready");
  const used = bcs.filter((row) => row.status === "used");

  return (
    <div className="space-y-8">
      <PageHeader
        title="BC"
        subtitle="The customer pays the same amount every month. Once the term has run, they buy against what they paid, plus the bonus if the shop gives it. What a bill does not use stays on the BC."
      />

      <Stats items={[
        { name: "Taking instalments", value: open.length },
        { name: "Collected this month", value: inr(collected), tone: "ok" },
        { name: "Instalments overdue", value: inr(sum(open, (row) => row.arrears)), tone: sum(open, (row) => row.arrears) > 0 ? "bad" : undefined },
        { name: "Still to give in goods", value: inr(sum(ready, (row) => row.balance)), note: "Matured BCs not yet used up" },
      ]} />

      <div className="space-y-4">
        <h2 className="font-serif text-[1.375rem] font-medium text-fg">Taking instalments</h2>
        <DataTable
          head={["Customer", "Card", "Each month", "Started", "Paid", "Overdue", "Next due", "Usable from"]}
          right={[2, 4, 5]}
          empty="No BC is running."
          rows={open.map((row) => [
            customer(row),
            row.cardNo ?? "-",
            inr(row.instalment),
            <span key="s" className="whitespace-nowrap">{dateOnly(row.startDate)}</span>,
            <span key="p">{inr(row.paid)} <span className="text-fg-3">· {row.monthsPaid}/{row.months}</span></span>,
            row.arrears > 0
              ? <span key="o" className="font-medium text-bad">{inr(row.arrears)} <span className="font-normal">· {row.monthsDue} mo</span></span>
              : <span key="o" className="text-fg-3">None</span>,
            <span key="n" className="whitespace-nowrap">{row.nextDue ? dateOnly(row.nextDue) : "Paid in full"}</span>,
            row.status === "to_mature"
              ? <StatusBadge key="m" tone="accent">Mature it</StatusBadge>
              : <span key="m" className="whitespace-nowrap">{dateOnly(row.maturesOn)}</span>,
          ])}
        />
      </div>

      <div className="space-y-4">
        <h2 className="font-serif text-[1.375rem] font-medium text-fg">Matured, to be bought against</h2>
        <DataTable
          head={["Customer", "Card", "Matured", "Paid", "Bonus", "Used", "Left"]}
          right={[3, 4, 5, 6]}
          empty="No matured BC is waiting to be used."
          rows={ready.map((row) => [
            customer(row),
            row.cardNo ?? "-",
            <span key="d" className="whitespace-nowrap">{dateOnly(row.maturedAt)}</span>,
            inr(row.paid),
            row.bonus ? inr(row.bonus) : <span key="b" className="text-fg-3">Not given</span>,
            inr(row.spent),
            <span key="l" className="font-medium text-fg">{inr(row.balance)}</span>,
          ])}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card title="Start a BC" className="lg:col-span-2" hint="Months and worth are prefilled for the usual BC: 12 instalments, worth 13.5 instalments when paid in full.">
          <ActionForm action={createBc} submitLabel="Start BC">
            <EntityFields label="Customer" entities={people} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Rupees label="Each month (₹)" name="instalment" required />
              <Field label="Months" name="months" type="number" step="1" min="1" max="60" defaultValue={12} required />
              <Field label="Worth (instalments)" name="multiplier" type="number" step="0.5" min="1" defaultValue={13.5} required />
              <Field label="Card no" name="cardNo" type="text" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First instalment paid now (₹)" name="paid" type="number" step="0.01" min="0" hint="Leave empty if nothing is paid today." />
              <ModeField label="Cash or online" />
            </div>
            <DateField label="Started on (today if left empty)" time={false} />
            <Field label="Note" name="note" type="text" />
          </ActionForm>
        </Card>

        {used.length > 0 && (
          <Card title="Used up" flush>
            <ul>
              {used.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/bc/${row.id}`} className={`text-sm ${linkClass}`}>{row.name ?? "Unknown"}</Link>
                    <p className="text-[13px] text-fg-3">{row.cardNo ? `Card ${row.cardNo} · ` : ""}matured {dateOnly(row.maturedAt)}</p>
                  </div>
                  <span className="shrink-0 text-sm text-fg tabular-nums">{inr(row.value)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
