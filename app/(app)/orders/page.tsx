import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemOrder } from "@/db/schema/sales";
import { createOrder } from "@/app/actions/orders";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, EntityFields, Field, Grams, linkClass, ModeField, PageHeader, Percent, Rupees, SelectField, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { dateOnly, grams, inr } from "@/lib/format";
import { getCurrentRates } from "@/lib/ledger";

export default async function OrdersPage() {
  await getCurrentUser();

  const customers = await listEntities(["customer"]);
  const rates = await getCurrentRates();
  const orders = await db
    .select({ order: itemOrder, customerName: entity.name })
    .from(itemOrder)
    .leftJoin(entity, eq(itemOrder.customer, entity.id))
    .orderBy(desc(itemOrder.date), desc(itemOrder.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="Pieces made to order, from booking to delivery." />

      <Card title="New order" hint={`To book today's rate, enter it below (gold ${rates.Gold ? inr(rates.Gold.rate) : "not set"}, silver ${rates.Silver ? inr(rates.Silver.rate) : "not set"} per gram fine). Leave it empty to bill at the delivery day's rate.`}>
        <ActionForm action={createOrder} submitLabel="Save order">
          <EntityFields label="Customer" entities={customers} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><Field label="What is ordered" name="name" type="text" placeholder="e.g. 22k bangle pair" required /></div>
            <SelectField label="Metal" name="metal" options={["Gold", "Silver"]} />
            <Grams label="Approx. weight (g)" name="weight" min="0" />
            <Percent label="Melting (%)" name="melting" />
            <Rupees label="Estimate (₹)" name="amt" min="0" />
            <Rupees label="Booked rate (₹/g fine)" name="bookedRate" min="0" />
            <Rupees label="Advance (₹)" name="advance" min="0" />
            <ModeField label="Advance received in" />
          </div>
          <DateField />
        </ActionForm>
      </Card>

      <DataTable
        head={["Date", "Customer", "Order", "Weight", "Estimate", "Advance", "Rate", "Status"]}
        right={[3, 4, 5]}
        empty="No orders yet."
        rows={orders.map(({ order, customerName }) => [
          <Link key="d" href={`/orders/${order.id}`} className={linkClass}>{dateOnly(order.date)}</Link>,
          <span key="c" className="font-medium text-fg">{customerName ?? "Unknown"}</span>,
          `${order.name} (${order.metal})`,
          grams(order.weight),
          inr(order.amt),
          inr(order.amtPaid),
          order.rateBooked ? `Booked ${inr(order.bookedRate)}` : "On delivery",
          <StatusBadge key="s" tone={order.status === "dispatched" ? "emerald" : order.status === "at shop" ? "blue" : "amber"}>{order.status}</StatusBadge>,
        ])}
      />
    </div>
  );
}
