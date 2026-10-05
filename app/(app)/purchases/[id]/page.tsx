import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { bill, billPayment, itemPurchased, itemStock, itemType } from "@/db/schema/sales";
import { addBillFinePayment, addBillLangdiPayment, addBillPayment } from "@/app/actions/purchases";
import { DateField, Grams, Percent, SelectField } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, grams, inr } from "@/lib/format";
import { round2 } from "@/lib/pricing";
import { cardClass, inputClass, labelClass, stockStatus, tableWrapClass, theadClass } from "@/lib/styles";

export default async function PurchaseBillPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [purchase] = await db
    .select({ bill, supplierName: entity.name })
    .from(bill)
    .leftJoin(entity, eq(bill.supplier, entity.id))
    .where(eq(bill.id, id));
  if (!purchase) notFound();

  const items = await db
    .select({
      id: itemPurchased.id,
      wastage: itemPurchased.wastage,
      making: itemPurchased.making,
      extraCharges: itemPurchased.extraCharges,
      amt: itemPurchased.amt,
      stockId: itemStock.id,
      label: itemStock.label,
      status: itemStock.status,
      netWeight: itemStock.netWeight,
      melting: itemStock.melting,
      typeName: itemType.name,
    })
    .from(itemPurchased)
    .leftJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .where(eq(itemPurchased.bill, id))
    .orderBy(asc(itemStock.label));

  const payments = await db.select().from(billPayment).where(eq(billPayment.bill, id)).orderBy(asc(billPayment.date));

  const b = purchase.bill;
  const due = round2((b.billAmt ?? 0) - (b.paidAmt ?? 0));
  const fineDue = b.rate ? due / b.rate : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/purchases" className="text-sm text-zinc-500 hover:text-zinc-300">← Purchases</Link>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">{purchase.supplierName ?? "Unknown supplier"}</h1>
        <p className="text-zinc-400 mt-1">
          {b.metal} bill of {dateOnly(b.date)} · standard {b.standard ?? "not recorded"} · rate {inr(b.rate)} per g fine
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { name: "Bill amount", value: inr(b.billAmt) },
          { name: "Paid", value: inr(b.paidAmt) },
          { name: "Balance due", value: inr(due) },
          { name: "Due in fine", value: grams(fineDue) },
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
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Melting</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Wastage</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Making /g</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Extra</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Amount</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-center">Now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium">
                    {item.stockId ? (
                      <Link href={`/inventory/${item.stockId}`} className="text-amber-500 hover:text-amber-400">
                        {item.typeName ?? "Piece"} #{item.label ?? "-"}
                      </Link>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{grams(item.netWeight)}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{item.melting ?? 0}%</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{item.wastage ?? 0}%</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(item.making)}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(item.extraCharges)}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right text-zinc-200">{inr(item.amt)}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-center">{stockStatus[item.status ?? ""]?.label ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Payments</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-zinc-500">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800/50 text-sm">
              {payments.map((payment) => (
                <li key={payment.id} className="flex justify-between py-2">
                  <span className="text-zinc-400">
                    {dateTime(payment.date)} · {payment.mode?.replace("_", " ")}
                    {payment.fineWeight ? ` · ${grams(payment.fineWeight)} fine (${payment.standard})` : ""}
                  </span>
                  <span className="text-zinc-200">{inr(payment.amt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {due > 0 && (
          <div className={cardClass}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">Pay supplier</h2>
            <ActionForm action={addBillPayment.bind(null, id)} submitLabel="Record payment">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="amt" className={labelClass}>Amount (₹)</label>
                  <input id="amt" name="amt" type="number" step="0.01" min="0.01" max={due} className={inputClass} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="mode" className={labelClass}>Paid from</label>
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
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Pay in fine</h2>
            <p className="text-sm text-zinc-500 mb-4">Valued at this bill&apos;s rate and standard. Clears the bill at {grams(fineDue)}.</p>
            <ActionForm action={addBillFinePayment.bind(null, id)} submitLabel="Record fine payment">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Grams label="Fine weight given (g)" name="weight" required />
                <SelectField label="Standard given" name="standard" options={["995", "999"]} defaultValue={b.standard === "999" ? "999" : "995"} />
              </div>
              <DateField />
            </ActionForm>
          </div>
        )}

        {due > 0 && (
          <div className={cardClass}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Pay in langdi</h2>
            <p className="text-sm text-zinc-500 mb-4">(weight − deduction) × tested purity, counted in this bill&apos;s standard.</p>
            <ActionForm action={addBillLangdiPayment.bind(null, id)} submitLabel="Record langdi payment">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Grams label="Langdi weight (g)" name="weight" required />
                <Percent label="Tested purity (%)" name="testedPurity" required />
                <Grams label="Deduction (g)" name="deduction" min="0" defaultValue="0" />
              </div>
              <DateField />
            </ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
