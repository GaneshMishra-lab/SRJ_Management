"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { entity, users } from "@/db/schema/entities";
import { logAudit, requireOwner } from "@/lib/dal";

export type StaffFormState = { error?: string; success?: string } | undefined;

export async function createStaffUser(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const owner = await requireOwner();

  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const contact = String(formData.get("contact") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !username) return { error: "Name and username are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (existing) return { error: "That username is already taken." };

  const passwordHash = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    const [staff] = await tx.insert(entity).values({
      name,
      type: "staff",
      contact: contact || null,
    }).returning();

    await tx.insert(users).values({
      name,
      username,
      passwordHash,
      role: "staff",
      entity: staff.id,
    });

    await logAudit(tx, owner.id, {
      tableName: "entity",
      recordId: staff.id,
      action: "insert",
      newValues: { ...staff, username, role: "staff" },
    });
  });

  revalidatePath("/users");
  return { success: `Login created for ${name}.` };
}

export async function setUserActive(userId: number, isActive: boolean) {
  const owner = await requireOwner();
  if (userId === owner.id) return;

  const [updated] = await db.update(users)
    .set({ isActive })
    .where(eq(users.id, userId))
    .returning({ entity: users.entity, username: users.username });

  if (updated?.entity) {
    await logAudit(db, owner.id, {
      tableName: "entity",
      recordId: updated.entity,
      action: "update",
      oldValues: { username: updated.username, isActive: !isActive },
      newValues: { username: updated.username, isActive },
    });
  }

  revalidatePath("/users");
}
