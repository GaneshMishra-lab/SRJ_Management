import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemOrder, itemOrderPayment, itemPurchased, itemSaleBill, itemStock, itemType } from "@/db/schema/sales";
import { addOrderOldGold, addOrderPayment, advanceOrder } from "@/app/actions/orders";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, Grams, linkClass, ModeField, PageHeader, Percent, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, grams, inr } from "@/lib/format";

const NEXT_STEP: Record<string, string> = {
  "order taken": "Mark as being made",
  "being made": "Mark as arrived at shop",
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({ order: itemOrder, customerName: entity.name })
    .from(itemOrder)
    .leftJoin(entity, eq(itemOrder.customer, entity.id))
    .where(eq(itemOrder.id, id));
  if (!row) notFound();

  const { order } = row;
  const payments = await db.select().from(itemOrderPayment).where(eq(itemOrderPayment.order, id)).orderBy(asc(itemOrderPayment.date));
  const pieces = await db
    .select({ id: itemStock.id, label: itemStock.label, typeName: itemType.name, netWeight: itemStock.netWeight })
    .from(itemPurchased)
    .innerJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .where(eq(itemPurchased.order, id));
  // Arrived on a supplier's bill but not yet labelled, so not yet a piece that can be sold.
  const unlabelled = await db
    .select({ id: itemPurchased.id, netWeight: itemPurchased.netWeight })
    .from(itemPurchased)
    .leftJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .where(and(eq(itemPurchased.order, id), isNull(itemStock.id)));
  const [sale] = await db.select({ id: itemSaleBill.id }).from(itemSaleBill).where(and(eq(itemSaleBill.order, id), isNull(itemSaleBill.cancelledAt)));
  const open = order.status !== "dispatched";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/orders", label: "Orders" }}
        title={<>{order.name} <StatusBadge tone={open ? "amber" : "emerald"}>{order.status}</StatusBadge></>}
        subtitle={`${row.customerName ?? "Unknown"} · ordered ${dateOnly(order.date)} · ${order.metal}`}
      />

      <Stats items={[
        { name: "Approx. weight", value: grams(order.weight) },
        { name: "Estimate", value: inr(order.amt) },
        { name: "Advance received", value: inr(order.amtPaid) },
        { name: "Rate", value: order.rateBooked ? `${inr(order.bookedRate)} booked` : "Delivery day" },
      ]} />

      <Card title="Progress">
        <ul className="space-y-2 text-sm text-fg-2">
          {pieces.length === 0 && unlabelled.length === 0 ? (
            <li className="text-fg-2">No piece has arrived yet. When the maker&apos;s bill comes in, pick this order on the piece in <Link href="/purchases/new" className={linkClass}>New Purchase</Link>.</li>
          ) : pieces.map((piece) => (
            <li key={piece.id}>Arrived: <Link href={`/inventory/${piece.id}`} className={linkClass}>{piece.typeName ?? "Piece"} #{piece.label}</Link> · {grams(piece.netWeight)}</li>
          ))}
          {unlabelled.map((item) => (
            <li key={item.id}>Arrived, waiting to be labelled · {grams(item.netWeight)}. <Link href={`/inventory/label/${item.id}`} className={linkClass}>Add it to stock</Link> before it can be delivered.</li>
          ))}
          {sale
            ? <li>Delivered on a <Link href={`/sales/${sale.id}`} className={linkClass}>sale bill</Link>, with the advance applied to it.</li>
            : pieces.length > 0 && <li className="text-fg-2">To deliver, start a <Link href="/sales/new" className={linkClass}>new sale</Link> and choose this order.</li>}
        </ul>
        {NEXT_STEP[order.status ?? ""] && (
          <div className="mt-4">
            <ActionForm action={advanceOrder.bind(null, id)} submitLabel={NEXT_STEP[order.status ?? ""]} />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Advances">
          {payments.length === 0 ? <p className="text-sm text-fg-3">No advance yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {payments.map((payment) => (
                <li key={payment.id} className="flex justify-between py-2">
                  <span className="text-fg-2">{dateTime(payment.date)} · {payment.mode?.replace("_", " ")}</span>
                  <span className="text-fg">{inr(payment.amt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {open && (
          <Card title="Take advance">
            <ActionForm action={addOrderPayment.bind(null, id)} submitLabel="Record advance">
              <Rupees label="Amount (₹)" name="amt" required />
              <ModeField label="Received in" />
              <DateField />
            </ActionForm>
          </Card>
        )}

        {open && (
          <Card title="Old metal as advance" hint="Counts towards the advance; no cash moves.">
            <ActionForm action={addOrderOldGold.bind(null, id)} submitLabel="Add old metal">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField label="Metal" name="metal" options={["Gold", "Silver", "Phuli"]} />
                <Grams label="Weight (g)" name="weight" required />
                <Percent label="Melting (%)" name="melting" min="0.001" required />
                <Rupees label="Agreed value (₹)" name="amt" required />
              </div>
              <DateField />
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
