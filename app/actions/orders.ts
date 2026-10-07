"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { itemOrder, itemOrderPayment, oldItem } from "@/db/schema/sales";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { resolveEntity } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2, round3 } from "@/lib/pricing";

const STEPS = ["order taken", "being made", "at shop"];

function revalidateOrders(id?: string) {
  revalidatePath("/orders");
  if (id) revalidatePath(`/orders/${id}`);
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
}

export async function createOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const name = text(formData, "name");
  const metal = text(formData, "metal");
  const weight = round3(num(formData, "weight"));
  const melting = round3(num(formData, "melting"));
  const amt = round2(num(formData, "amt"));
  const bookedRate = round2(num(formData, "bookedRate"));
  const advance = round2(num(formData, "advance"));
  const mode = text(formData, "mode");

  if (!name) return { error: "Describe what is being ordered." };
  if (metal !== "Gold" && metal !== "Silver") return { error: "Choose the metal." };
  if (melting < 0 || melting > 100) return { error: "Melting must be between 0 and 100." };
  if (advance < 0) return { error: "Advance cannot be negative." };
  if (advance > 0 && !isCashMode(mode)) return { error: "Choose cash or online for the advance." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const customer = await resolveEntity(tx, user.id, formData, "customer");
      const [order] = await tx.insert(itemOrder).values({
        customer, date, name, metal,
        weight: weight || null, melting: melting || null, status: "order taken",
        rateBooked: bookedRate > 0, bookedRate: bookedRate || null,
        amt: amt || null, amtPaid: advance,
      }).returning();
      await logAudit(tx, user.id, { tableName: "item_order", recordId: order.id, action: "insert", newValues: order });

      if (advance > 0 && isCashMode(mode)) {
        const [payment] = await tx.insert(itemOrderPayment).values({
          order: order.id, date, amt: advance, mode,
        }).returning();
        await recordCash(tx, {
          direction: "in", amt: advance, location: locationFor(mode),
          sourceTable: "item_order_payment", sourceId: payment.id, desc: `Advance on order: ${name}`, date,
        });
      }
    });
  } catch (error) {
    return fail(error, "Could not save the order.");
  }

  revalidateOrders();
  // Entered from the day book's popup, the order is saved and the book stays open.
  if (text(formData, "from") === "daybook") return { success: "Order saved." };
  redirect("/orders");
}

// Orders move forward one step at a time; "dispatched" is set by the sale that delivers it.
export async function advanceOrder(id: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(id)) return { error: "Order not found." };

  try {
    const [order] = await db.select().from(itemOrder).where(eq(itemOrder.id, id));
    const next = STEPS[STEPS.indexOf(order?.status ?? "") + 1];
    if (!order || !next) throw new UserError("This order cannot be moved further from here.");
    const [updated] = await db.update(itemOrder)
      .set({ status: next, updatedAt: new Date() })
      .where(and(eq(itemOrder.id, id), eq(itemOrder.status, order.status!)))
      .returning();
    if (updated) {
      await logAudit(db, user.id, { tableName: "item_order", recordId: id, action: "update", oldValues: { status: order.status }, newValues: { status: next } });
    }
  } catch (error) {
    return fail(error, "Could not update the order.");
  }

  revalidateOrders(id);
  return { success: "Order updated." };
}

export async function addOrderPayment(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  if (!isUuid(id)) return { error: "Order not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const [order] = await tx.update(itemOrder)
        .set({ amtPaid: sql`coalesce(${itemOrder.amtPaid}, 0) + ${amt}`, updatedAt: new Date() })
        .where(and(eq(itemOrder.id, id), ne(itemOrder.status, "dispatched")))
        .returning();
      if (!order) throw new UserError("This order is already delivered.");

      const [payment] = await tx.insert(itemOrderPayment).values({
        order: id, date, amt, mode,
      }).returning();
      await recordCash(tx, {
        direction: "in", amt, location: locationFor(mode),
        sourceTable: "item_order_payment", sourceId: payment.id, desc: `Advance on order: ${order.name ?? ""}`, date,
      });
      await logAudit(tx, user.id, { tableName: "item_order_payment", recordId: payment.id, action: "insert", newValues: payment });
    });
  } catch (error) {
    return fail(error, "Could not record the advance.");
  }

  revalidateOrders(id);
  return { success: "Advance recorded." };
}

// Old metal handed over against an order counts as advance; no cash moves.
export async function addOrderOldGold(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const metal = text(formData, "metal");
  const weight = round3(num(formData, "weight"));
  const melting = round3(num(formData, "melting"));
  const amt = round2(num(formData, "amt"));
  if (!isUuid(id)) return { error: "Order not found." };
  if (!["Gold", "Silver", "Phuli"].includes(metal)) return { error: "Choose Gold, Silver or Phuli." };
  if (weight <= 0 || amt <= 0) return { error: "Enter the weight and the agreed value." };
  if (melting <= 0 || melting > 100) return { error: "Melting must be between 0 and 100." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const [order] = await tx.update(itemOrder)
        .set({ amtPaid: sql`coalesce(${itemOrder.amtPaid}, 0) + ${amt}`, updatedAt: new Date() })
        .where(and(eq(itemOrder.id, id), ne(itemOrder.status, "dispatched")))
        .returning();
      if (!order) throw new UserError("This order is already delivered.");

      const [old] = await tx.insert(oldItem).values({
        customer: order.customer, date, weight, metal, melting,
        amt, paidAmt: amt, order: id, status: "vault",
      }).returning();
      await tx.insert(itemOrderPayment).values({ order: id, date, amt, mode: "old_item" });
      await logAudit(tx, user.id, { tableName: "old_item", recordId: old.id, action: "insert", newValues: old });
    });
  } catch (error) {
    return fail(error, "Could not record the old metal.");
  }

  revalidateOrders(id);
  revalidatePath("/old-gold");
  return { success: "Old metal added as advance." };
}
