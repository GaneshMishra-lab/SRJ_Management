"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { itemRepairing, itemRepairingPayment } from "@/db/schema/sales";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { resolveEntity, Tx } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2, round3 } from "@/lib/pricing";

function revalidateRepairs(id?: string) {
  revalidatePath("/repairs");
  if (id) revalidatePath(`/repairs/${id}`);
  revalidatePath("/ledgers");
  revalidatePath("/dashboard");
}

export async function createRepair(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const desc = text(formData, "desc");
  const receivedWeight = round3(num(formData, "receivedWeight"));
  const amt = round2(num(formData, "amt"));
  if (!desc) return { error: "Describe the item and the repair." };
  if (receivedWeight <= 0) return { error: "Enter the weight received, to avoid disputes later." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const customer = await resolveEntity(tx, user.id, formData, "customer");
      const [row] = await tx.insert(itemRepairing).values({
        customer, desc, receivedDate: date, receivedWeight,
        status: "taken", amt: amt || null, paidAmt: 0,
      }).returning();
      await logAudit(tx, user.id, { tableName: "item_repairing", recordId: row.id, action: "insert", newValues: row });
    });
  } catch (error) {
    return fail(error, "Could not save the repair.");
  }

  revalidateRepairs();
  return { success: "Repair taken in." };
}

// Moves a repair to its next status; fails if it is not at the expected step.
async function step(tx: Tx, userId: number, id: string, from: string, values: Partial<typeof itemRepairing.$inferInsert>) {
  const [row] = await tx.update(itemRepairing)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(itemRepairing.id, id), eq(itemRepairing.status, from)))
    .returning();
  if (!row) throw new UserError("This repair has already moved on. Reload the page.");
  await logAudit(tx, userId, { tableName: "item_repairing", recordId: id, action: "update", oldValues: { status: from }, newValues: values });
  return row;
}

export async function sendRepair(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(id)) return { error: "Repair not found." };
  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const karigar = await resolveEntity(tx, user.id, formData, "supplier");
      await step(tx, user.id, id, "taken", { status: "sent for repair", karigar, sentDate: date });
    });
  } catch (error) {
    return fail(error, "Could not update the repair.");
  }
  revalidateRepairs(id);
  return { success: "Sent for repair." };
}

export async function markRepaired(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  if (!isUuid(id)) return { error: "Repair not found." };
  if (amt < 0) return { error: "Charge cannot be negative." };
  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(itemRepairing).where(eq(itemRepairing.id, id));
      if (current && amt < (current.paidAmt ?? 0)) throw new UserError("The charge cannot be less than what is already paid.");
      // A repair done in the shop skips the "sent" step.
      await step(tx, user.id, id, current?.status === "taken" ? "taken" : "sent for repair", {
        status: "repaired", doneDate: date, amt,
      });
    });
  } catch (error) {
    return fail(error, "Could not update the repair.");
  }
  revalidateRepairs(id);
  return { success: "Marked as repaired." };
}

export async function returnRepair(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const returnedWeight = round3(num(formData, "returnedWeight"));
  if (!isUuid(id)) return { error: "Repair not found." };
  if (returnedWeight <= 0) return { error: "Enter the weight handed back." };
  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      await step(tx, user.id, id, "repaired", { status: "returned", returnedDate: date, returnedWeight });
    });
  } catch (error) {
    return fail(error, "Could not update the repair.");
  }
  revalidateRepairs(id);
  return { success: "Returned to customer." };
}

export async function addRepairPayment(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  if (!isUuid(id)) return { error: "Repair not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(itemRepairing)
        .set({ paidAmt: sql`coalesce(${itemRepairing.paidAmt}, 0) + ${amt}`, updatedAt: new Date() })
        .where(and(eq(itemRepairing.id, id), sql`coalesce(${itemRepairing.paidAmt}, 0) + ${amt} <= coalesce(${itemRepairing.amt}, 0)`))
        .returning();
      if (!updated) throw new UserError("That is more than the repair charge still due.");

      const [payment] = await tx.insert(itemRepairingPayment).values({
        repair: id, date, amt, mode,
      }).returning();
      await recordCash(tx, {
        direction: "in", amt, location: locationFor(mode),
        sourceTable: "item_repairing_payment", sourceId: payment.id, desc: "Repair charge received", date,
      });
      await logAudit(tx, user.id, { tableName: "item_repairing_payment", recordId: payment.id, action: "insert", newValues: payment });
    });
  } catch (error) {
    return fail(error, "Could not record the payment.");
  }

  revalidateRepairs(id);
  return { success: "Payment recorded." };
}
