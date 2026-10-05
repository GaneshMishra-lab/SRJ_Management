import { PageHeader } from "@/components/ui";
import { PurchaseForm } from "@/components/PurchaseForm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemOrder, itemType } from "@/db/schema/sales";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/dal";

export default async function NewPurchasePage() {
  await getCurrentUser();

  // Fetch suppliers to populate dropdown
  const suppliers = await db
    .select({
      id: entity.id,
      name: entity.name,
    })
    .from(entity)
    .where(eq(entity.type, "supplier"));

  const itemTypes = await db
    .select({
      id: itemType.id,
      name: itemType.name,
      metal: itemType.metal,
    })
    .from(itemType);

  // Orders still waiting for their piece from the maker
  const orders = await db
    .select({ id: itemOrder.id, name: itemOrder.name, metal: itemOrder.metal, customerName: entity.name })
    .from(itemOrder)
    .leftJoin(entity, eq(itemOrder.customer, entity.id))
    .where(inArray(itemOrder.status, ["order taken", "being made"]));

  return (
    <div className="space-y-6">
      <PageHeader title="New purchase" subtitle="An incoming bill from a supplier." back={{ href: "/purchases", label: "Purchases" }} />
      <PurchaseForm suppliers={suppliers} itemTypes={itemTypes} orders={orders} />
    </div>
  );
}
