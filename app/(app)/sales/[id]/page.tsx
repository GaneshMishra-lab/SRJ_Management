import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { cashLedger } from "@/db/schema/ledger";
import { itemSale, itemSaleBill, itemSaleDetails, itemStock, itemType } from "@/db/schema/sales";
import { addSalePayment, cancelSale, discountSaleDue } from "@/app/actions/sales";
import { ActionForm } from "@/components/ActionForm";
import { RowLink } from "@/components/controls";
import { Card, DateField, Field, ModeField, Notice, PageHeader, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, grams, inr, istDate, parseDbDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";
import { linkClass, rowClass, tdClass, thClass } from "@/lib/styles";

export default async function SaleBillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [sale] = await db
    .select({ bill: itemSaleBill, customerName: entity.name, customerContact: entity.contact })
    .from(itemSaleBill)
    .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
    .where(eq(itemSaleBill.id, id));
  if (!sale) notFound();

  const lines = await db
    .select({
      id: itemSale.id,
      rate: itemSale.rate,
      makingPct: itemSale.makingPct,
      metalValue: itemSale.metalValue,
      makingAmt: itemSale.makingAmt,
      gst: itemSale.gst,
      amt: itemSale.amt,
      stockId: itemStock.id,
      label: itemStock.label,
      // A loose line has no stock piece and carries its own weight and melting.
      netWeight: sql<number | null>`coalesce(${itemStock.netWeight}, ${itemSale.weight})`.mapWith(Number),
      melting: sql<number | null>`coalesce(${itemStock.melting}, ${itemSale.melting})`.mapWith(Number),
      typeName: itemType.name,
      looseTypeId: itemSale.itemType,
    })
    .from(itemSale)
    .leftJoin(itemStock, eq(itemSale.item, itemStock.id))
    .leftJoin(itemType, sql`${itemType.id} = coalesce(${itemStock.itemType}, ${itemSale.itemType})`)
    .where(eq(itemSale.bill, id))
    .orderBy(asc(itemType.name), asc(itemStock.label));

  const payments = await db.select().from(itemSaleDetails).where(eq(itemSaleDetails.sale, id)).orderBy(asc(itemSaleDetails.date));

  const b = sale.bill;
  const cancelled = !!b.cancelledAt;
  // Nothing is owed on a cancelled bill.
  const due = cancelled ? 0 : round2((b.totalAmt ?? 0) - (b.paidAmt ?? 0));
  const reversals = cancelled
    ? await db.select().from(cashLedger).where(and(eq(cashLedger.sourceTable, "item_sale_bill"), eq(cashLedger.sourceId, id)))
    : [];
  const cashReceived = round2(
    payments.filter((payment) => payment.mode === "cash" || payment.mode === "online").reduce((sum, payment) => sum + (payment.amtPaid ?? 0), 0),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/sales", label: "Sales" }}
        title={
          <>
            {sale.customerName ?? "Unknown customer"}
            <StatusBadge tone={cancelled ? "bad" : due > 0 ? "warn" : "ok"}>{cancelled ? "Cancelled" : due > 0 ? "Pending" : "Paid"}</StatusBadge>
          </>
        }
        subtitle={`Sale bill of ${dateOnly(b.date)}${sale.customerContact ? ` · ${sale.customerContact}` : ""}`}
      />

      {cancelled && (
        <Notice tone="bad" title={`Cancelled on ${dateOnly(b.cancelledAt)}`}>
          <p>Reason: {b.cancelReason}</p>
          <p>The pieces are back in stock and nothing is owed on this bill.</p>
          {reversals.map((entry) => (
            <p key={entry.id}>{inr(entry.amt)} reversed out of the {entry.location === "vault" ? "vault" : "bank account"} on {dateOnly(entry.date)}.</p>
          ))}
          <p className="mt-2">
            <Link href={`/sales/new?date=${istDate(parseDbDate(b.date ?? b.createdAt))}`} className={linkClass}>Enter the corrected bill</Link>
            {" "}with this bill&apos;s date, and set its payment date to the day the correction is made.
          </p>
        </Notice>
      )}

      <Stats items={[
        { name: "Computed amount", value: inr(b.computedAmt) },
        { name: "Discount", value: inr(b.discount) },
        { name: "Bill total", value: inr(b.totalAmt) },
        { name: "Balance due", value: inr(due), tone: due > 0 ? "accent" : undefined },
      ]} />

      <Card title="Pieces" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-fg-2">
            <thead>
              <tr>
                <th className={`${thClass} border-t`}>Piece</th>
                <th className={`${thClass} border-t text-right`}>Weight</th>
                <th className={`${thClass} border-t text-right`}>Rate /g</th>
                <th className={`${thClass} border-t text-right`}>Metal</th>
                <th className={`${thClass} border-t text-right`}>Making</th>
                <th className={`${thClass} border-t text-right`}>GST</th>
                <th className={`${thClass} border-t text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const href = line.stockId ? `/inventory/${line.stockId}` : `/inventory/loose/${line.looseTypeId}`;
                return (
                <RowLink key={line.id} href={href} className={rowClass}>
                  <td className={tdClass}>
                    <Link href={href} className="font-medium text-fg">
                      {line.stockId ? `${line.typeName ?? "Piece"} #${line.label ?? "-"}` : `${line.typeName ?? "Loose metal"} · loose`}
                    </Link>
                    <span className="ml-2 text-fg-3">{line.melting ?? 0}%</span>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>{grams(line.netWeight)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{inr(line.rate)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{inr(line.metalValue)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{inr(line.makingAmt)} <span className="text-fg-3">({line.makingPct ?? 0}%)</span></td>
                  <td className={`${tdClass} text-right tabular-nums`}>{inr(line.gst)}</td>
                  <td className={`${tdClass} text-right text-fg tabular-nums`}>{inr(line.amt)}</td>
                </RowLink>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card title="Payments" hint={`${inr(b.paidAmt)} received in all`} flush>
          {payments.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-3">No payments yet.</p>
          ) : (
            <ul>
              {payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-fg capitalize">{payment.mode?.replace("_", " ")}</p>
                    <p className="text-[13px] text-fg-3">{dateTime(payment.date)}</p>
                  </div>
                  <span className="shrink-0 text-sm text-fg tabular-nums">{inr(payment.amtPaid)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {due > 0 && (
          <Card title="Receive payment">
            <ActionForm action={addSalePayment.bind(null, id)} submitLabel="Record payment">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Amount (₹)" name="amt" type="number" step="0.01" min="0.01" max={due} required />
                <ModeField label="Received in" />
              </div>
              <DateField />
            </ActionForm>
          </Card>
        )}

        {due > 0 && (
          <Card
            title="Give the balance as discount"
            hint="For a balance the customer will not pay. It lowers the bill total; no cash is recorded. Record any part they do pay as a payment first."
          >
            <ActionForm action={discountSaleDue.bind(null, id)} submitLabel="Record discount" tone="secondary">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Discount (₹)" name="amt" type="number" step="0.01" min="0.01" max={due} defaultValue={due} required />
                <Field label="Reason (optional)" name="reason" type="text" placeholder="e.g. Settled at 42,000" />
              </div>
            </ActionForm>
          </Card>
        )}

        {!cancelled && user.role === "owner" && (
          <Card
            title="Cancel this bill"
            hint={`For a bill entered wrongly or a sale that was undone. The bill is kept and marked cancelled, its pieces return to stock${cashReceived > 0 ? `, and the ${inr(cashReceived)} received is reversed in the cash ledger on the cancellation date` : ""}. Earlier days are not changed. Owner only; this cannot be undone.`}
          >
            <ActionForm action={cancelSale.bind(null, id)} submitLabel="Cancel bill" tone="danger">
              <Field label="Reason" name="reason" type="text" placeholder="e.g. Wrong piece billed" required />
              <DateField label="Cancelled on (today if left empty)" />
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
