import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemStock, itemType, oldItem, oldItemPayment } from "@/db/schema/sales";
import { meltOldItem, payOldItem, refurbishOldItem } from "@/app/actions/oldgold";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, Field, Grams, linkClass, ModeField, PageHeader, Percent, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, grams, inr } from "@/lib/format";
import { round2 } from "@/lib/pricing";

export default async function OldItemPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({ item: oldItem, customerName: entity.name })
    .from(oldItem)
    .leftJoin(entity, eq(oldItem.customer, entity.id))
    .where(eq(oldItem.id, id));
  if (!row) notFound();

  const { item } = row;
  const payments = await db.select().from(oldItemPayment).where(eq(oldItemPayment.oldItem, id)).orderBy(asc(oldItemPayment.date));
  const [piece] = await db.select({ id: itemStock.id }).from(itemStock).where(eq(itemStock.oldItemSource, id));
  const types = await db.select().from(itemType).orderBy(asc(itemType.name));
  const owed = round2((item.amt ?? 0) - (item.paidAmt ?? 0));
  // Phuli is low-purity gold, so it can become a gold piece.
  const fits = types.filter((type) => type.metal === (item.metal === "Silver" ? "Silver" : "Gold"));

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/old-gold", label: "Old Gold" }}
        title={<>{item.metal} · {grams(item.weight)} <StatusBadge tone={item.status === "vault" ? "amber" : "zinc"}>{item.status}</StatusBadge></>}
        subtitle={`From ${row.customerName ?? "unknown"} on ${dateOnly(item.date)}`}
      />

      <Stats items={[
        { name: "Melting", value: `${item.melting ?? 0}%` },
        { name: "Agreed value", value: inr(item.amt) },
        { name: "Paid or adjusted", value: inr(item.paidAmt) },
        { name: "Still owed to customer", value: inr(owed) },
      ]} />

      <Card title="Where it came from and went">
        <ul className="space-y-2 text-sm text-zinc-300">
          {item.saleBill && <li>Given in exchange on a <Link href={`/sales/${item.saleBill}`} className={linkClass}>sale bill</Link>; its value was set against that bill.</li>}
          {item.order && <li>Given as advance on an <Link href={`/orders/${item.order}`} className={linkClass}>order</Link>.</li>}
          {item.goldLoan && <li>Taken over from a defaulted <Link href={`/gold-loans/${item.goldLoan}`} className={linkClass}>gold loan</Link>.</li>}
          {!item.saleBill && !item.order && !item.goldLoan && <li>Bought outright from the customer.</li>}
          {payments.map((payment) => (
            <li key={payment.id} className="text-zinc-400">{dateTime(payment.date)} · paid {inr(payment.amt)} by {payment.mode}</li>
          ))}
          {item.status === "returned" && <li>Given back to the customer on {dateOnly(item.processedDate)}, when that sale bill was cancelled.</li>}
          {item.status === "melted" && <li>Melted into langdi on {dateOnly(item.processedDate)} (see <Link href="/metal" className={linkClass}>Metal &amp; Langdi</Link>).</li>}
          {item.status === "refurbished" && <li>Refurbished on {dateOnly(item.processedDate)}{piece && <> and added to stock as a <Link href={`/inventory/${piece.id}`} className={linkClass}>piece</Link></>}.</li>}
        </ul>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {owed > 0 && (
          <Card title="Pay customer">
            <ActionForm action={payOldItem.bind(null, id)} submitLabel="Record payment">
              <Rupees label="Amount (₹)" name="amt" max={owed} required />
              <ModeField label="Paid from" />
              <DateField />
            </ActionForm>
          </Card>
        )}

        {item.status === "vault" && (
          <Card title="Melt" hint="Becomes langdi. This cannot be undone.">
            <ActionForm action={meltOldItem.bind(null, id)} submitLabel="Melt">
              <Grams label="Melted weight (g)" name="weight" defaultValue={item.weight ?? undefined} required />
              <Percent label="Estimated purity (%)" name="estPurity" min="0.001" defaultValue={item.melting ?? undefined} required />
              <DateField />
            </ActionForm>
          </Card>
        )}

        {item.status === "vault" && (
          <Card title="Refurbish into stock" hint="Describe the finished piece; it gets its own label.">
            <ActionForm action={refurbishOldItem.bind(null, id)} submitLabel="Add to stock">
              <SelectField label="Item type" name="itemType" options={fits.map((type) => ({ value: type.id, label: type.name }))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Grams label="Gross weight (g)" name="grossWeight" defaultValue={item.weight ?? undefined} required />
                <Grams label="Net weight (g)" name="netWeight" placeholder="same as gross" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Percent label="Melting (%)" name="melting" min="0.001" defaultValue={item.melting ?? undefined} required />
                <Field label="HUID (optional)" name="huid" type="text" />
              </div>
              <DateField />
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
