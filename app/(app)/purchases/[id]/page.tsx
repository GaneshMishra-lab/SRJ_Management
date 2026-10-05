import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { bill, billPayment, itemPurchased, itemStock, itemType } from "@/db/schema/sales";
import { addBillFinePayment, addBillLangdiPayment, addBillPayment } from "@/app/actions/purchases";
import { RowLink } from "@/components/controls";
import { Card, DateField, Field, ModeField, PageHeader, SelectField, Stats, StatusBadge } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, grams, inr } from "@/lib/format";
import { round2 } from "@/lib/pricing";
import { rowClass, stockStatus, tdClass, thClass } from "@/lib/styles";

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
      <PageHeader
        back={{ href: "/purchases", label: "Purchases" }}
        title={<>{purchase.supplierName ?? "Unknown supplier"}<StatusBadge tone={due > 0 ? "warn" : "ok"}>{due > 0 ? "Pending" : "Paid"}</StatusBadge></>}
        subtitle={`${b.metal} bill of ${dateOnly(b.date)} · standard ${b.standard ?? "not recorded"} · rate ${inr(b.rate)} per gram fine`}
      />

      <Stats items={[
        { name: "Bill amount", value: inr(b.billAmt) },
        { name: "Paid", value: inr(b.paidAmt) },
        { name: "Balance due", value: inr(due), tone: due > 0 ? "accent" : undefined },
        { name: "Due in fine", value: grams(fineDue) },
      ]} />

      <Card title="Pieces" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-fg-2">
            <thead>
              <tr>
                <th className={`${thClass} border-t`}>Piece</th>
                <th className={`${thClass} border-t text-right`}>Net weight</th>
                <th className={`${thClass} border-t text-right`}>Melting</th>
                <th className={`${thClass} border-t text-right`}>Wastage</th>
                <th className={`${thClass} border-t text-right`}>Making /g</th>
                <th className={`${thClass} border-t text-right`}>Extra</th>
                <th className={`${thClass} border-t text-right`}>Amount</th>
                <th className={`${thClass} border-t`}>Now</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const cells = (
                  <>
                    <td className={tdClass}>
                      {item.stockId
                        ? <Link href={`/inventory/${item.stockId}`} className="font-medium text-fg">{item.typeName ?? "Piece"} #{item.label ?? "-"}</Link>
                        : "-"}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{grams(item.netWeight)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{item.melting ?? 0}%</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{item.wastage ?? 0}%</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{inr(item.making)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{inr(item.extraCharges)}</td>
                    <td className={`${tdClass} text-right text-fg tabular-nums`}>{inr(item.amt)}</td>
                    <td className={tdClass}>
                      {stockStatus[item.status ?? ""]
                        ? <StatusBadge tone={stockStatus[item.status ?? ""].tone}>{stockStatus[item.status ?? ""].label}</StatusBadge>
                        : "-"}
                    </td>
                  </>
                );
                return item.stockId
                  ? <RowLink key={item.id} href={`/inventory/${item.stockId}`} className={rowClass}>{cells}</RowLink>
                  : <tr key={item.id} className={rowClass}>{cells}</tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card title="Payments" flush>
          {payments.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-3">No payments yet.</p>
          ) : (
            <ul>
              {payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-fg capitalize">
                      {payment.mode?.replace("_", " ")}
                      {payment.fineWeight ? <span className="normal-case text-fg-3"> · {grams(payment.fineWeight)} fine ({payment.standard})</span> : null}
                    </p>
                    <p className="text-[13px] text-fg-3">{dateTime(payment.date)}</p>
                  </div>
                  <span className="shrink-0 text-sm text-fg tabular-nums">{inr(payment.amt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {due > 0 && (
          <Card title="Pay supplier">
            <ActionForm action={addBillPayment.bind(null, id)} submitLabel="Record payment">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Amount (₹)" name="amt" type="number" step="0.01" min="0.01" max={due} required />
                <ModeField label="Paid from" />
              </div>
              <DateField />
            </ActionForm>
          </Card>
        )}

        {due > 0 && (
          <Card title="Pay in fine" hint={`Valued at this bill's rate and standard. Clears the bill at ${grams(fineDue)}.`}>
            <ActionForm action={addBillFinePayment.bind(null, id)} submitLabel="Record fine payment">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Fine weight given (g)" name="weight" type="number" step="0.001" min="0.001" required />
                <SelectField label="Standard given" name="standard" options={["995", "999"]} defaultValue={b.standard === "999" ? "999" : "995"} />
              </div>
              <DateField />
            </ActionForm>
          </Card>
        )}

        {due > 0 && (
          <Card title="Pay in langdi" hint="(weight − deduction) × tested purity, counted in this bill's standard.">
            <ActionForm action={addBillLangdiPayment.bind(null, id)} submitLabel="Record langdi payment">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Langdi weight (g)" name="weight" type="number" step="0.001" min="0.001" required />
                <Field label="Tested purity (%)" name="testedPurity" type="number" step="0.001" min="0" max="100" required />
                <Field label="Deduction (g)" name="deduction" type="number" step="0.001" min="0" defaultValue="0" />
              </div>
              <DateField />
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
