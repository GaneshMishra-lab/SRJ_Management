import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { cashLedger } from "@/db/schema/ledger";
import { itemSale, itemSaleBill, itemSaleDetails, itemStock, itemType } from "@/db/schema/sales";
import { addSalePayment, cancelSale, discountSaleDue } from "@/app/actions/sales";
import { ActionForm } from "@/components/ActionForm";
import { DateField } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, grams, inr, istDate, parseDbDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";
import { cardClass, inputClass, labelClass, tableWrapClass, theadClass } from "@/lib/styles";

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
      netWeight: itemStock.netWeight,
      melting: itemStock.melting,
      typeName: itemType.name,
    })
    .from(itemSale)
    .leftJoin(itemStock, eq(itemSale.item, itemStock.id))
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
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
      <div>
        <Link href="/sales" className="text-sm text-zinc-500 hover:text-zinc-300">← Sales</Link>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">{sale.customerName ?? "Unknown customer"}</h1>
        <p className="text-zinc-400 mt-1">
          Sale bill of {dateOnly(b.date)}{sale.customerContact ? ` · ${sale.customerContact}` : ""}
        </p>
      </div>

      {cancelled && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 sm:p-6 text-sm text-red-300 space-y-1">
          <p className="text-base font-semibold text-red-400">Cancelled on {dateOnly(b.cancelledAt)}</p>
          <p>Reason: {b.cancelReason}</p>
          <p>The pieces are back in stock and nothing is owed on this bill.</p>
          {reversals.map((entry) => (
            <p key={entry.id}>{inr(entry.amt)} reversed out of the {entry.location === "vault" ? "vault" : "bank account"} on {dateOnly(entry.date)}.</p>
          ))}
          <p className="pt-2">
            <Link href={`/sales/new?date=${istDate(parseDbDate(b.date ?? b.createdAt))}`} className="text-amber-500 hover:text-amber-400">Enter the corrected bill</Link>
            {" "}with this bill&apos;s date, and set its payment date to the day the correction is made.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { name: "Computed amount", value: inr(b.computedAmt) },
          { name: "Discount", value: inr(b.discount) },
          { name: "Bill total", value: inr(b.totalAmt) },
          { name: "Balance due", value: inr(due) },
        ].map((stat) => (
          <div key={stat.name} className={cardClass}>
            <p className="text-sm text-zinc-400">{stat.name}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-100">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className={tableWrapClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className={theadClass}>
              <tr>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Piece</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Net wt</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Rate /g</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Metal</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Making</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">GST</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {lines.map((line) => (
                <tr key={line.id} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium">
                    <Link href={`/inventory/${line.stockId}`} className="text-amber-500 hover:text-amber-400">
                      {line.typeName ?? "Piece"} #{line.label ?? "-"}
                    </Link>
                    <span className="ml-2 font-normal text-zinc-500">{line.melting ?? 0}%</span>
                  </td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{grams(line.netWeight)}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(line.rate)}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(line.metalValue)}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(line.makingAmt)} ({line.makingPct ?? 0}%)</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(line.gst)}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right text-zinc-200">{inr(line.amt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Payments · {inr(b.paidAmt)} received</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-zinc-500">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800/50 text-sm">
              {payments.map((payment) => (
                <li key={payment.id} className="flex justify-between py-2">
                  <span className="text-zinc-400">{dateTime(payment.date)} · {payment.mode}</span>
                  <span className="text-zinc-200">{inr(payment.amtPaid)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {due > 0 && (
          <div className={cardClass}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">Receive payment</h2>
            <ActionForm action={addSalePayment.bind(null, id)} submitLabel="Record payment">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="amt" className={labelClass}>Amount (₹)</label>
                  <input id="amt" name="amt" type="number" step="0.01" min="0.01" max={due} className={inputClass} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="mode" className={labelClass}>Received in</label>
                  <select id="mode" name="mode" className={inputClass}>
                    <option value="cash">Cash (Vault)</option>
                    <option value="online">Online (Bank)</option>
                  </select>
                </div>
              </div>
              <DateField />
            </ActionForm>
          </div>
        )}

        {due > 0 && (
          <div className={cardClass}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Give the balance as discount</h2>
            <p className="text-sm text-zinc-500 mb-4">
              For a balance the customer will not pay. It lowers the bill total; no cash is recorded. Record any part they do pay as a payment first.
            </p>
            <ActionForm action={discountSaleDue.bind(null, id)} submitLabel="Record discount">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="discount-amt" className={labelClass}>Discount (₹)</label>
                  <input id="discount-amt" name="amt" type="number" step="0.01" min="0.01" max={due} defaultValue={due} className={inputClass} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="discount-reason" className={labelClass}>Reason (optional)</label>
                  <input id="discount-reason" name="reason" type="text" placeholder="e.g. Settled at 42,000" className={inputClass} />
                </div>
              </div>
            </ActionForm>
          </div>
        )}

        {!cancelled && user.role === "owner" && (
          <div className={cardClass}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Cancel this bill</h2>
            <p className="text-sm text-zinc-500 mb-4">
              For a bill entered wrongly or a sale that was undone. The bill is kept and marked cancelled, its pieces return to stock
              {cashReceived > 0 ? `, and the ${inr(cashReceived)} received is reversed in the cash ledger on the cancellation date` : ""}.
              Earlier days are not changed. Owner only; this cannot be undone.
            </p>
            <ActionForm action={cancelSale.bind(null, id)} submitLabel="Cancel bill">
              <div className="space-y-2">
                <label htmlFor="cancel-reason" className={labelClass}>Reason</label>
                <input id="cancel-reason" name="reason" type="text" placeholder="e.g. Wrong piece billed" className={inputClass} required />
              </div>
              <DateField label="Cancelled on (today if left empty)" />
            </ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
