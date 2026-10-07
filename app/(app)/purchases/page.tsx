import { db } from "@/db";
import { bill } from "@/db/schema/sales";
import { entity } from "@/db/schema/entities";
import { eq, desc, sql } from "drizzle-orm";
import { PurchasesList } from "@/components/PurchasesList";
import { getCurrentUser } from "@/lib/dal";
import { dueStatus } from "@/lib/due";
import { dateOnly } from "@/lib/format";
import { round2 } from "@/lib/pricing";

export default async function PurchasesPage() {
  await getCurrentUser();

  const purchases = await db
    .select({
      id: bill.id,
      date: bill.date,
      metal: bill.metal,
      billAmt: bill.billAmt,
      paidAmt: bill.paidAmt,
      dueDate: bill.dueDate,
      supplierName: entity.name,
      // items on the bill not yet labelled into stock
      toLabel: sql<number>`(select count(*) from item_purchased p where p.bill = ${bill.id} and not exists (select 1 from item_stock s where s.item = p.id))`.mapWith(Number),
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
        dueOn: purchase.dueDate ? dateOnly(purchase.dueDate) : null,
        credit: dueStatus(purchase.dueDate, round2((purchase.billAmt ?? 0) - (purchase.paidAmt ?? 0))),
        toLabel: purchase.toLabel,
      }))}
    />
  );
}
