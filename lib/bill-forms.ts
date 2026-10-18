import "server-only";
import { asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemOrder, itemPurchased, itemStock, itemType } from "@/db/schema/sales";
import { listBcs } from "@/lib/bc";
import { getCurrentRates } from "@/lib/ledger";
import { looseBalances } from "@/lib/loose";

// What the sale and purchase bill forms choose from. Read here once, for the two places each
// form is shown: its own page, and the day book's popup.

export async function saleFormData(day: string) {
  const customers = await db
    .select({ id: entity.id, name: entity.name })
    .from(entity)
    .where(eq(entity.type, "customer"))
    .orderBy(asc(entity.name));

  const pieces = await db
    .select({
      id: itemStock.id,
      label: itemStock.label,
      typeName: itemType.name,
      metal: itemStock.metal,
      netWeight: itemStock.netWeight,
      melting: itemStock.melting,
      status: itemStock.status,
    })
    .from(itemStock)
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .where(inArray(itemStock.status, ["stock", "on_approval"]))
    .orderBy(asc(itemType.name), asc(itemStock.label));

  // Undelivered orders whose piece has arrived and is available to bill.
  const made = await db
    .select({ order: itemOrder, stockId: itemStock.id })
    .from(itemOrder)
    .innerJoin(itemPurchased, eq(itemPurchased.order, itemOrder.id))
    .innerJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .where(ne(itemOrder.status, "dispatched"));
  const orders = [...new Set(made.map((row) => row.order.id))].map((orderId) => {
    const rows = made.filter((row) => row.order.id === orderId);
    const { order } = rows[0];
    return {
      id: order.id,
      customerId: order.customer,
      name: order.name,
      stockIds: rows.map((row) => row.stockId).filter((stockId) => pieces.some((piece) => piece.id === stockId)),
      advance: order.amtPaid ?? 0,
      bookedRate: order.rateBooked ? order.bookedRate : null,
    };
  }).filter((order) => order.stockIds.length > 0);

  // Loose metal (mani) that can be sold by weight: one choice per type and melting on hand.
  const loose = (await looseBalances()).filter((row) => row.weight > 0);

  // Every BC not yet used up: a matured one is spent on the bill, a running one is shown so the
  // counter can tell the customer when it matures.
  const bcs = (await listBcs()).filter((row) => row.status !== "used").map((row) => ({
    id: row.id,
    customerId: row.customer,
    cardNo: row.cardNo,
    balance: row.balance,
    matured: row.status === "ready",
    maturesOn: row.maturesOn,
    monthsPaid: row.monthsPaid,
    months: row.months,
  }));

  // A sale written up later is billed at its own day's rates.
  const rates = await getCurrentRates(day);
  return { customers, pieces, loose, orders, bcs, rates };
}

export async function purchaseFormData() {
  const suppliers = await db.select({ id: entity.id, name: entity.name }).from(entity).where(eq(entity.type, "supplier"));
  const itemTypes = await db.select({ id: itemType.id, name: itemType.name, metal: itemType.metal }).from(itemType).orderBy(asc(itemType.loose), asc(itemType.name));

  // Orders still waiting for their piece from the maker
  const orders = await db
    .select({ id: itemOrder.id, name: itemOrder.name, metal: itemOrder.metal, customerName: entity.name })
    .from(itemOrder)
    .leftJoin(entity, eq(itemOrder.customer, entity.id))
    .where(inArray(itemOrder.status, ["order taken", "being made"]));

  return { suppliers, itemTypes, orders };
}
