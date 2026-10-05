import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema/entities";
import { readSession } from "@/lib/session";

// The logged-in user, re-checked against the database so a deactivated login
// stops working immediately. Call this in every protected page and action.
export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) redirect("/login");

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      entity: users.entity,
    })
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.isActive, true)));

  if (!user) redirect("/login");
  return user;
});

export async function requireOwner() {
  const user = await getCurrentUser();
  if (user.role !== "owner") redirect("/dashboard");
  return user;
}

type Executor = Pick<typeof db, "insert">;

export async function logAudit(
  executor: Executor,
  changedBy: number,
  entry: {
    tableName: string;
    recordId: string;
    action: "insert" | "update" | "delete";
    oldValues?: unknown;
    newValues?: unknown;
  },
) {
  await executor.insert(auditLog).values({ ...entry, changedBy });
}
