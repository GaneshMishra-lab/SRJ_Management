"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { itemStock, langdiLedger, oldItem, oldItemPayment } from "@/db/schema/sales";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { nextLabel, resolveEntity, Tx } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2, round3 } from "@/lib/pricing";

const OLD_METALS = ["Gold", "Silver", "Phuli"];

function revalidateOldGold(id?: string) {
  revalidatePath("/old-gold");
  if (id) revalidatePath(`/old-gold/${id}`);
  revalidatePath("/metal");
  revalidatePath("/inventory");
  revalidatePath("/ledgers");
  revalidatePath("/dashboard");
}

async function payOut(tx: Tx, userId: number, oldItemId: string, amt: number, mode: "cash" | "online", date: string) {
  const [payment] = await tx.insert(oldItemPayment).values({
    oldItem: oldItemId, date, amt, mode,
  }).returning();
  await recordCash(tx, {
    direction: "out", amt, location: locationFor(mode),
    sourceTable: "old_item_payment", sourceId: payment.id, desc: "Paid to customer for old metal", date,
  });
  await logAudit(tx, userId, { tableName: "old_item_payment", recordId: payment.id, action: "insert", newValues: payment });
}

// Buy old metal outright from a customer.
export async function buyOldItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const metal = text(formData, "metal");
  const weight = round3(num(formData, "weight"));
  const melting = round3(num(formData, "melting"));
  const amt = round2(num(formData, "amt"));
  const paid = round2(num(formData, "paid"));
  const mode = text(formData, "mode");

  if (!OLD_METALS.includes(metal)) return { error: "Choose Gold, Silver or Phuli." };
  if (weight <= 0) return { error: "Enter the weight." };
  if (melting <= 0 || melting > 100) return { error: "Melting must be between 0 and 100." };
  if (amt <= 0) return { error: "Enter the agreed value." };
  if (paid < 0 || paid > amt) return { error: "Amount paid now cannot be more than the value." };
  if (paid > 0 && !isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const customer = await resolveEntity(tx, user.id, formData, "customer");
      const [row] = await tx.insert(oldItem).values({
        customer, date, weight, metal, melting, amt, paidAmt: paid, status: "vault",
      }).returning();
      await logAudit(tx, user.id, { tableName: "old_item", recordId: row.id, action: "insert", newValues: row });
      if (paid > 0 && isCashMode(mode)) await payOut(tx, user.id, row.id, paid, mode, date);
    });
  } catch (error) {
    return fail(error, "Could not record the old metal.");
  }

  revalidateOldGold();
  return { success: "Old metal recorded." };
}

export async function payOldItem(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  if (!isUuid(id)) return { error: "Old item not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(oldItem)
        .set({ paidAmt: sql`coalesce(${oldItem.paidAmt}, 0) + ${amt}`, updatedAt: new Date() })
        .where(and(eq(oldItem.id, id), sql`coalesce(${oldItem.paidAmt}, 0) + ${amt} <= coalesce(${oldItem.amt}, 0)`))
        .returning();
      if (!updated) throw new UserError("That is more than what the customer is still owed.");
      await payOut(tx, user.id, id, amt, mode, date);
    });
  } catch (error) {
    return fail(error, "Could not record the payment.");
  }

  revalidateOldGold(id);
  return { success: "Payment recorded." };
}

async function leaveVault(tx: Tx, id: string, status: "melted" | "refurbished", date: string) {
  const [row] = await tx.update(oldItem)
    .set({ status, processedDate: date, updatedAt: new Date() })
    .where(and(eq(oldItem.id, id), eq(oldItem.status, "vault")))
    .returning();
  if (!row) throw new UserError("This item has already been processed. Reload the page.");
  return row;
}

export async function meltOldItem(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const weight = round3(num(formData, "weight"));
  const estPurity = round3(num(formData, "estPurity"));
  if (!isUuid(id)) return { error: "Old item not found." };
  if (weight <= 0) return { error: "Enter the melted weight." };
  if (estPurity <= 0 || estPurity > 100) return { error: "Estimated purity must be between 0 and 100." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const row = await leaveVault(tx, id, "melted", date);
      // Phuli is low-purity gold: it joins the gold langdi, just at a lower purity.
      const [entry] = await tx.insert(langdiLedger).values({
        date,
        metal: row.metal === "Silver" ? "Silver" : "Gold",
        direction: "in", weight, pieces: 1, estPurity,
        sourceTable: "melt", sourceId: id,
        desc: row.metal === "Phuli" ? "Melted old phuli" : "Melted old item",
      }).returning();
      await tx.update(oldItem).set({ langdiEntry: entry.id }).where(eq(oldItem.id, id));
      await logAudit(tx, user.id, { tableName: "langdi_ledger", recordId: entry.id, action: "insert", newValues: entry });
    });
  } catch (error) {
    return fail(error, "Could not record the melt.");
  }

  revalidateOldGold(id);
  return { success: "Melted into langdi." };
}

// A refurbished old item becomes a stock piece, described in full at this point.
export async function refurbishOldItem(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const itemTypeId = text(formData, "itemType");
  const grossWeight = round3(num(formData, "grossWeight"));
  const netWeight = round3(num(formData, "netWeight")) || grossWeight;
  const melting = round3(num(formData, "melting"));
  const huid = text(formData, "huid");

  if (!isUuid(id)) return { error: "Old item not found." };
  if (!isUuid(itemTypeId)) return { error: "Choose an item type." };
  if (grossWeight <= 0 || netWeight > grossWeight) return { error: "Enter the gross weight; net weight cannot be more than gross." };
  if (melting <= 0 || melting > 100) return { error: "Melting must be between 0 and 100." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      await leaveVault(tx, id, "refurbished", date);
      const { label, metal } = await nextLabel(tx, itemTypeId);
      const [piece] = await tx.insert(itemStock).values({
        date,
        itemType: itemTypeId, metal, grossWeight, netWeight, melting,
        huid: huid || null, label, status: "stock", oldItemSource: id,
      }).returning();
      await logAudit(tx, user.id, { tableName: "item_stock", recordId: piece.id, action: "insert", newValues: piece });
    });
  } catch (error) {
    return fail(error, "Could not add the item to stock.");
  }

  revalidateOldGold(id);
  return { success: "Added to stock." };
}
