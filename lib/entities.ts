import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemStock, itemType } from "@/db/schema/sales";
import { logAudit } from "@/lib/dal";
import { isUuid, text, UserError } from "@/lib/form";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type EntityType = "customer" | "supplier" | "staff";

// Who can be picked wherever the shop deals with a customer: staff buy and borrow too.
export const CUSTOMER_TYPES: EntityType[] = ["customer", "staff"];

export async function listEntities(types: EntityType[]) {
  return db
    .select({ id: entity.id, name: entity.name, type: entity.type })
    .from(entity)
    .where(inArray(entity.type, types))
    .orderBy(asc(entity.name));
}

// Reads the fields rendered by <EntityFields>: an existing person, or a new one to create.
export async function resolveEntity(tx: Tx, userId: number, formData: FormData, newType: EntityType = "customer") {
  const newName = text(formData, "newName");
  if (newName) {
    const [created] = await tx.insert(entity).values({
      name: newName,
      type: newType,
      contact: text(formData, "newContact") || null,
    }).returning();
    await logAudit(tx, userId, { tableName: "entity", recordId: created.id, action: "insert", newValues: created });
    return created.id;
  }

  const id = text(formData, "entity");
  if (!isUuid(id)) throw new UserError("Choose a person, or enter a new name.");
  return id;
}

// Labels are per item type and never reused.
export async function nextLabel(tx: Tx, itemTypeId: string) {
  const [row] = await tx.update(itemType)
    .set({ nextLabel: sql`${itemType.nextLabel} + 1` })
    .where(eq(itemType.id, itemTypeId))
    .returning({ label: sql<number>`${itemType.nextLabel} - 1`, metal: itemType.metal, loose: itemType.loose });
  if (!row) throw new UserError("Choose an item type.");
  if (row.loose) throw new UserError("That item type is kept loose by weight, not as labelled pieces.");
  return row;
}

// The HUID typed on a form (the 6-character hallmark code stamped on the piece), in capitals, or
// null when left empty. No two pieces may carry the same one; `pieceId` is the piece it is for.
export async function huidOf(tx: Tx, formData: FormData, pieceId?: string) {
  const huid = text(formData, "huid").replace(/\s+/g, "").toUpperCase();
  if (!huid) return null;
  if (!/^[A-Z0-9]{6}$/.test(huid)) throw new UserError("An HUID is 6 letters and digits, as stamped on the piece.");
  const [taken] = await tx.select({ id: itemStock.id, typeName: itemType.name, label: itemStock.label })
    .from(itemStock)
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .where(eq(itemStock.huid, huid));
  if (taken && taken.id !== pieceId) throw new UserError(`${taken.typeName ?? "Another piece"} #${taken.label ?? "-"} already has HUID ${huid}.`);
  return huid;
}
