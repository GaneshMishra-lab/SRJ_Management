import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemType } from "@/db/schema/sales";
import { logAudit } from "@/lib/dal";
import { isUuid, text, UserError } from "@/lib/form";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type EntityType = "customer" | "supplier" | "staff";

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
    .returning({ label: sql<number>`${itemType.nextLabel} - 1`, metal: itemType.metal });
  if (!row) throw new UserError("Choose an item type.");
  return row;
}
