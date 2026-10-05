"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema/entities";
import { createSession, deleteSession, Role } from "@/lib/session";

export type LoginState = { error?: string } | undefined;

// Compared against when the username is unknown, so both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync("no-such-user", 10);

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password." };

  const [user] = await db.select().from(users).where(eq(users.username, username));
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.isActive || !passwordOk) {
    return { error: "Wrong username or password." };
  }

  await createSession({ userId: user.id, role: user.role as Role });
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
