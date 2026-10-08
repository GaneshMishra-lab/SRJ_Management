import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemSale, itemSaleBill, itemStock, itemType } from "@/db/schema/sales";
import { SalesList } from "@/components/SalesList";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly } from "@/lib/format";

export default async function SalesPage() {
  await getCurrentUser();

  // One row per piece sold, with the state of the bill it is on.
  const lines = await db
    .select({
      id: itemSale.id,
      billId: itemSaleBill.id,
      date: itemSaleBill.date,
      totalAmt: itemSaleBill.totalAmt,
      paidAmt: itemSaleBill.paidAmt,
      cancelledAt: itemSaleBill.cancelledAt,
      customerName: entity.name,
      amt: itemSale.amt,
      // A loose line (mani) has no stock piece: its metal comes from its type, its weight from the line.
      metal: sql<string | null>`coalesce(${itemStock.metal}, ${itemType.metal})`,
      weight: sql<number | null>`coalesce(${itemStock.netWeight}, ${itemSale.weight})`.mapWith(Number),
      label: itemStock.label,
      typeName: itemType.name,
      stockId: itemStock.id,
    })
    .from(itemSale)
    .innerJoin(itemSaleBill, eq(itemSale.bill, itemSaleBill.id))
    .leftJoin(itemStock, eq(itemSale.item, itemStock.id))
    .leftJoin(itemType, sql`${itemType.id} = coalesce(${itemStock.itemType}, ${itemSale.itemType})`)
    .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
    .orderBy(desc(itemSaleBill.date), desc(itemSaleBill.createdAt))
    .limit(500);

  return (
    <SalesList
      rows={lines.map((line) => ({
        id: line.id,
        billId: line.billId,
        date: dateOnly(line.date),
        item: line.stockId ? `${line.typeName ?? "Piece"} #${line.label ?? "-"}` : `${line.typeName ?? "Loose metal"} · loose`,
        metal: line.metal,
        weight: line.weight,
        amt: line.amt,
        customer: line.customerName ?? "Unknown",
        status: line.cancelledAt ? "Cancelled" : (line.paidAmt ?? 0) >= (line.totalAmt ?? 0) ? "Paid" : "Pending",
      }))}
    />
  );
}
