import { db } from "@/db";
import { bill } from "@/db/schema/sales";
import { entity } from "@/db/schema/entities";
import { eq, desc } from "drizzle-orm";
import { PurchasesList } from "@/components/PurchasesList";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly } from "@/lib/format";

export default async function PurchasesPage() {
  await getCurrentUser();

  const purchases = await db
    .select({
      id: bill.id,
      date: bill.date,
      metal: bill.metal,
      billAmt: bill.billAmt,
      paidAmt: bill.paidAmt,
      supplierName: entity.name,
    })
    .from(bill)
    .leftJoin(entity, eq(bill.supplier, entity.id))
    .orderBy(desc(bill.date), desc(bill.createdAt))
    .limit(500);

  return (
    <PurchasesList
      rows={purchases.map((purchase) => ({
        id: purchase.id,
        date: dateOnly(purchase.date),
        supplier: purchase.supplierName ?? "Unknown",
        metal: purchase.metal,
        billAmt: purchase.billAmt,
        paidAmt: purchase.paidAmt,
      }))}
    />
  );
}
