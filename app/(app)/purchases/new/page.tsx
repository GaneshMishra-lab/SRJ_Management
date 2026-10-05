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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">New Purchase</h1>
        <p className="text-zinc-400 mt-1">Record a new incoming bill from a supplier.</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-6 backdrop-blur-sm">
        <PurchaseForm suppliers={suppliers} itemTypes={itemTypes} orders={orders} />
      </div>
    </div>
  );
}
