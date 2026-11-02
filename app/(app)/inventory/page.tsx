import { db } from "@/db";
import { miscCategory, miscItem } from "@/db/schema/entities";
import { miscTrade } from "@/db/schema/ledger";
import { itemPurchased, itemStock, itemType, looseStockLedger } from "@/db/schema/sales";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { looseBalances, looseFromPurchase } from "@/lib/loose";
import { InventoryManager } from "@/components/InventoryManager";
import { getCurrentUser } from "@/lib/dal";

export default async function InventoryPage() {
  await getCurrentUser();

  // Fetch item types
  const itemTypes = await db.select().from(itemType);

  // Every labelled piece: the search finds sold ones too, the lists by type show only what is in the shop.
  const rawInventory = await db
    .select({
      id: itemStock.id,
      date: itemStock.date,
      status: itemStock.status,
      label: itemStock.label,
      itemTypeId: itemStock.itemType,
      typeName: itemType.name,
      metal: itemStock.metal,
      weight: itemStock.netWeight,
      grossWeight: itemStock.grossWeight,
      huid: itemStock.huid,
      purchaseId: itemStock.item,
    })
    .from(itemStock)
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .orderBy(desc(itemStock.createdAt));

  // Transform data for the UI
  const inventory = rawInventory.map(({ purchaseId, weight, ...item }) => ({
    ...item,
    netWeight: weight,
    isNew: !!purchaseId, // otherwise a refurbished old item
  }));

  // Purchased items still waiting to be labelled into stock
  const [{ toLabel }] = await db
    .select({ toLabel: count() })
    .from(itemPurchased)
    .leftJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .leftJoin(looseStockLedger, looseFromPurchase)
    .where(and(isNull(itemStock.id), isNull(looseStockLedger.id)));

  // Loose metal (mani) on hand, by type and melting.
  const loose = await looseBalances();

  // Miscellaneous items are counted in pieces: what was bought minus what was sold.
  const misc = await db
    .select({
      id: miscItem.id,
      name: miscItem.name,
      unit: miscItem.unit,
      categoryName: miscCategory.name,
      inHand: sql<number>`coalesce(sum(case when ${miscTrade.type} = 'purchase' then ${miscTrade.qty} when ${miscTrade.type} = 'sale' then -${miscTrade.qty} end), 0)`.mapWith(Number),
    })
    .from(miscItem)
    .leftJoin(miscCategory, eq(miscItem.category, miscCategory.id))
    .leftJoin(miscTrade, eq(miscTrade.item, miscItem.id))
    .groupBy(miscItem.id, miscCategory.name)
    .orderBy(asc(miscItem.name));

  return (
    <InventoryManager itemTypes={itemTypes} inventory={inventory} loose={loose} misc={misc} toLabel={toLabel} />
  );
}
