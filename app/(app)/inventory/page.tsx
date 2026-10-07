import { db } from "@/db";
import { itemPurchased, itemStock, itemType } from "@/db/schema/sales";
import { count, desc, eq, inArray, isNull } from "drizzle-orm";
import { InventoryManager } from "@/components/InventoryManager";
import { getCurrentUser } from "@/lib/dal";

export default async function InventoryPage() {
  await getCurrentUser();

  // Fetch item types
  const itemTypes = await db.select().from(itemType);

  // Fetch active inventory items
  const rawInventory = await db
    .select({
      id: itemStock.id,
      date: itemStock.date,
      status: itemStock.status,
      label: itemStock.label,
      itemTypeId: itemStock.itemType,
      metal: itemStock.metal,
      weight: itemStock.netWeight,
      purchaseId: itemStock.item,
    })
    .from(itemStock)
    .where(inArray(itemStock.status, ['stock', 'on_approval']))
    .orderBy(desc(itemStock.createdAt));

  // Transform data for the UI
  const inventory = rawInventory.map(({ purchaseId, ...item }) => ({
    ...item,
    isNew: !!purchaseId, // otherwise a refurbished old item
    typeName: null,
  }));

  // Purchased items still waiting to be labelled into stock
  const [{ toLabel }] = await db
    .select({ toLabel: count() })
    .from(itemPurchased)
    .leftJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .where(isNull(itemStock.id));

  return (
    <InventoryManager itemTypes={itemTypes} inventory={inventory} toLabel={toLabel} />
  );
}
