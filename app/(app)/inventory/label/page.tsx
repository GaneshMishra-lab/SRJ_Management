import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { bill, itemPurchased, itemStock, itemType, looseStockLedger } from "@/db/schema/sales";
import { looseFromPurchase } from "@/lib/loose";
import { DataTable, linkClass, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, grams } from "@/lib/format";

export default async function LabelQueuePage() {
  await getCurrentUser();

  // Purchased items that no stock piece has been made from yet.
  const items = await db
    .select({
      id: itemPurchased.id,
      netWeight: itemPurchased.netWeight,
      melting: itemPurchased.melting,
      typeName: itemType.name,
      loose: itemType.loose,
      metal: bill.metal,
      billDate: bill.date,
      supplierName: entity.name,
    })
    .from(itemPurchased)
    .innerJoin(bill, eq(itemPurchased.bill, bill.id))
    .leftJoin(entity, eq(bill.supplier, entity.id))
    .leftJoin(itemType, eq(itemPurchased.itemType, itemType.id))
    .leftJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .leftJoin(looseStockLedger, looseFromPurchase)
    .where(and(isNull(itemStock.id), isNull(looseStockLedger.id)))
    .orderBy(asc(bill.date), asc(itemPurchased.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader title="To label" subtitle="Purchased items not yet added to stock, oldest bill first." back={{ href: "/inventory", label: "Inventory" }} />

      <DataTable
        head={["Item", "Metal", "Supplier", "Billed on", "Net weight", "Melting"]}
        right={[4, 5]}
        empty="Nothing is waiting to be labelled."
        rows={items.map((item) => [
          <Link key="i" href={`/inventory/label/${item.id}`} className={linkClass}>{item.typeName ?? "Item"}{item.loose ? " · loose" : ""}</Link>,
          item.metal,
          item.supplierName ?? "Unknown",
          dateOnly(item.billDate),
          grams(item.netWeight),
          `${item.melting ?? 0}%`,
        ])}
      />
    </div>
  );
}
