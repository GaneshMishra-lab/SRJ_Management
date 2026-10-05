import { desc, eq } from "drizzle-orm";
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
      metal: itemStock.metal,
      weight: itemStock.netWeight,
      label: itemStock.label,
      typeName: itemType.name,
    })
    .from(itemSale)
    .innerJoin(itemSaleBill, eq(itemSale.bill, itemSaleBill.id))
    .leftJoin(itemStock, eq(itemSale.item, itemStock.id))
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
    .orderBy(desc(itemSaleBill.date), desc(itemSaleBill.createdAt))
    .limit(500);

  return (
    <SalesList
      rows={lines.map((line) => ({
        id: line.id,
        billId: line.billId,
        date: dateOnly(line.date),
        item: `${line.typeName ?? "Piece"} #${line.label ?? "-"}`,
        metal: line.metal,
        weight: line.weight,
        amt: line.amt,
        customer: line.customerName ?? "Unknown",
        status: line.cancelledAt ? "Cancelled" : (line.paidAmt ?? 0) >= (line.totalAmt ?? 0) ? "Paid" : "Pending",
      }))}
    />
  );
}
