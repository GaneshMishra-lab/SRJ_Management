import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { bill, billPayment, itemPurchased, itemStock, itemType } from "@/db/schema/sales";
import { addBillFinePayment, addBillLangdiPayment, addBillPayment, setBillDueDate } from "@/app/actions/purchases";
import { RowLink } from "@/components/controls";
import { CreditFields } from "@/components/CreditFields";
import { Card, DateField, Field, ModeField, PageHeader, SelectField, Stats, StatusBadge } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { creditDaysOf, dueStatus } from "@/lib/due";
import { dateOnly, dateTime, grams, inr, istDate, parseDbDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";
import { linkClass, rowClass, stockStatus, tdClass, thClass } from "@/lib/styles";

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
      netWeight: itemPurchased.netWeight,
      melting: itemPurchased.melting,
      billedType: itemPurchased.itemType,
      stockId: itemStock.id,
      label: itemStock.label,
      status: itemStock.status,
      stockType: itemStock.itemType,
    })
    .from(itemPurchased)
    .leftJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .where(eq(itemPurchased.bill, id))
    .orderBy(asc(itemPurchased.createdAt), asc(itemPurchased.id));
  // A piece is named by the type it was labelled as; until then, by the type on the bill.
  const typeNames = new Map((await db.select({ id: itemType.id, name: itemType.name }).from(itemType)).map((type) => [type.id, type.name]));
  const toLabel = items.filter((item) => !item.stockId).length;

  const payments = await db.select().from(billPayment).where(eq(billPayment.bill, id)).orderBy(asc(billPayment.date));

  const b = purchase.bill;
  const due = round2((b.billAmt ?? 0) - (b.paidAmt ?? 0));
  const fineDue = b.rate ? due / b.rate : 0;
  const credit = dueStatus(b.dueDate, due);
  const billDay = istDate(parseDbDate(b.date ?? b.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/purchases", label: "Purchases" }}
        title={<>{purchase.supplierName ?? "Unknown supplier"}<StatusBadge tone={due > 0 ? "warn" : "ok"}>{due > 0 ? "Pending" : "Paid"}</StatusBadge>{credit && credit.tone !== "neutral" && <StatusBadge tone={credit.tone}>{credit.label}</StatusBadge>}</>}
        subtitle={`${b.metal} bill of ${dateOnly(b.date)} · standard ${b.standard ?? "not recorded"} · rate ${inr(b.rate)} per gram fine`}
      />

      <Stats items={[
        { name: "Bill amount", value: inr(b.billAmt) },
        { name: "Paid", value: inr(b.paidAmt) },
        {
          name: "Balance due",
          value: inr(due),
          tone: credit?.tone === "bad" ? "bad" : due > 0 ? "accent" : undefined,
          note: due <= 0 ? undefined : credit ? `By ${dateOnly(b.dueDate)} · ${credit.label.toLowerCase()}` : "No due date set",
        },
        { name: "Due in fine", value: grams(fineDue) },
      ]} />

      <Card title="Pieces" hint={toLabel > 0 ? `As billed. ${toLabel} still to be labelled and added to stock.` : "As billed. All are labelled."} flush>
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
                        ? <Link href={`/inventory/${item.stockId}`} className="font-medium text-fg">{typeNames.get(item.stockType ?? "") ?? "Piece"} #{item.label ?? "-"}</Link>
                        : <Link href={`/inventory/label/${item.id}`} className="font-medium text-fg">{typeNames.get(item.billedType ?? "") ?? "Item"}</Link>}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{grams(item.netWeight)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{item.melting ?? 0}%</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{item.wastage ?? 0}%</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{inr(item.making)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{inr(item.extraCharges)}</td>
                    <td className={`${tdClass} text-right text-fg tabular-nums`}>{inr(item.amt)}</td>
                    <td className={tdClass}>
                      {!item.stockId
                        ? <span className="inline-flex items-center gap-3"><StatusBadge tone="warn">To label</StatusBadge><Link href={`/inventory/label/${item.id}`} className={linkClass}>Add to stock</Link></span>
                        : stockStatus[item.status ?? ""]
                          ? <StatusBadge tone={stockStatus[item.status ?? ""].tone}>{stockStatus[item.status ?? ""].label}</StatusBadge>
                          : "-"}
                    </td>
                  </>
                );
                return <RowLink key={item.id} href={item.stockId ? `/inventory/${item.stockId}` : `/inventory/label/${item.id}`} className={rowClass}>{cells}</RowLink>;
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
          <Card
            title="Supplier's credit"
            hint={b.dueDate
              ? `To be paid by ${dateOnly(b.dueDate)}, ${creditDaysOf(billDay, b.dueDate)} days from the bill. Enter new days or a new date to change it; save both empty to remove it.`
              : "No due date yet. Days are counted from the bill's date."}
          >
            <ActionForm action={setBillDueDate.bind(null, id)} submitLabel="Save due date" tone="secondary">
              <CreditFields baseDay={billDay} />
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
