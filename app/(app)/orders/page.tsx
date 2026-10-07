import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemOrder } from "@/db/schema/sales";
import { DataTable, linkClass, PageHeader, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, grams, inr } from "@/lib/format";
import { btn } from "@/lib/styles";

export default async function OrdersPage() {
  await getCurrentUser();

  const orders = await db
    .select({ order: itemOrder, customerName: entity.name })
    .from(itemOrder)
    .leftJoin(entity, eq(itemOrder.customer, entity.id))
    .orderBy(desc(itemOrder.date), desc(itemOrder.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="Pieces made to order, from booking to delivery.">
        <Link href="/orders/new" className={btn()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New order
        </Link>
      </PageHeader>

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
