"use server";

import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { daybookHead, daybookRule, daybookSettings } from "@/db/schema/daybook";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { labelsFor, readLang } from "@/lib/daybook/i18n";
import { KINDS } from "@/lib/daybook/kinds";
import { fail, FormState, isUuid, text, UserError } from "@/lib/form";

// The day book's settings: its heads, where app entries are written, and the text at the top of
// the page. Open to everyone who can log in; every change is in the audit log.

// The audit log wants a uuid for each record; the single settings row is given this one.
const SETTINGS_RECORD = "00000000-0000-0000-0000-000000000001";

// Messages are said in the language the day book is being read in.
const say = async () => labelsFor(readLang((await cookies()).get("daybook_lang")?.value)).set;

function revalidateSettings() {
  revalidatePath("/daybook");
  revalidatePath("/daybook/settings");
}

const sideOf = (formData: FormData) => (text(formData, "side") === "debit" ? "debit" : "credit");
const pageOf = (formData: FormData) => (text(formData, "page") === "2" ? 2 : 1);
const lastOrder = sql<number>`coalesce(max(${daybookHead.sortOrder}), 0)`.mapWith(Number);

// The extra-field rows of a head's form. A row with both names cleared is a field removed.
function readFields(formData: FormData) {
  const fields = [];
  for (let i = 0; formData.has(`fieldMr${i}`); i++) {
    const labelMr = text(formData, `fieldMr${i}`);
    const labelEn = text(formData, `fieldEn${i}`);
    if (!labelMr && !labelEn) continue;
    fields.push({
      // The key ties saved entries to the field, so it never changes once given.
      key: text(formData, `fieldKey${i}`) || `f_${randomUUID().slice(0, 8)}`,
      labelMr: labelMr || labelEn,
      labelEn: labelEn || labelMr,
      type: text(formData, `fieldType${i}`) === "number" ? "number" as const : "text" as const,
      ...(formData.get(`fieldReq${i}`) === "on" ? { required: true } : {}),
    });
  }
  return fields;
}

export async function saveHead(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const t = await say();
  const nameMr = text(formData, "nameMr");
  const nameEn = text(formData, "nameEn");
  if (!isUuid(id)) return { error: t.failed };
  if (!nameMr || !nameEn) return { error: t.needNames };

  try {
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(daybookHead).where(eq(daybookHead.id, id)).for("update");
      if (!old) throw new UserError(t.failed);

      // The opening cash and the bank account are filled in by the book: they keep their side,
      // stay on the page, and take no typed lines, so the form fields for those are not theirs.
      const fixed = old.role !== null;
      const side = fixed ? old.side : sideOf(formData);
      let sortOrder = old.sortOrder;
      if (side !== old.side) {
        // A head moved across goes to the foot of its new side.
        const [{ last }] = await tx.select({ last: lastOrder }).from(daybookHead).where(eq(daybookHead.side, side));
        sortOrder = last + 1;
      }
      const [row] = await tx.update(daybookHead)
        .set({
          nameMr,
          nameEn,
          side,
          sortOrder,
          page: pageOf(formData),
          ...(fixed ? {} : {
            active: formData.get("active") === "on",
            partyRequired: formData.get("partyRequired") === "on",
            showRate: formData.get("showRate") === "on",
            extraFields: readFields(formData),
          }),
          updatedAt: new Date(),
        })
        .where(eq(daybookHead.id, id))
        .returning();
      await logAudit(tx, user.id, { tableName: "daybook_head", recordId: id, action: "update", oldValues: old, newValues: row });
    });
  } catch (error) {
    return fail(error, t.failed);
  }

  revalidateSettings();
  return { success: t.saved };
}

export async function addHead(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const t = await say();
  const nameMr = text(formData, "nameMr");
  const nameEn = text(formData, "nameEn");
  if (!nameMr || !nameEn) return { error: t.needNames };

  try {
    await db.transaction(async (tx) => {
      const side = sideOf(formData);
      const [{ last }] = await tx.select({ last: lastOrder }).from(daybookHead).where(eq(daybookHead.side, side));
      const [row] = await tx.insert(daybookHead).values({ nameMr, nameEn, side, sortOrder: last + 1, page: pageOf(formData) }).returning();
      await logAudit(tx, user.id, { tableName: "daybook_head", recordId: row.id, action: "insert", newValues: row });
    });
  } catch (error) {
    return fail(error, t.failed);
  }

  revalidateSettings();
  return { success: t.saved };
}

// Moves a head one place up or down its side of the page.
export async function moveHead(id: string, by: -1 | 1) {
  await getCurrentUser();
  if (!isUuid(id)) return;

  await db.transaction(async (tx) => {
    const [head] = await tx.select().from(daybookHead).where(eq(daybookHead.id, id));
    if (!head) return;
    const column = await tx.select().from(daybookHead).where(eq(daybookHead.side, head.side)).orderBy(asc(daybookHead.sortOrder)).for("update");
    const other = column[column.findIndex((h) => h.id === id) + by];
    if (!other) return;
    await tx.update(daybookHead).set({ sortOrder: other.sortOrder, updatedAt: new Date() }).where(eq(daybookHead.id, head.id));
    await tx.update(daybookHead).set({ sortOrder: head.sortOrder, updatedAt: new Date() }).where(eq(daybookHead.id, other.id));
  });

  revalidateSettings();
}

// Which head each kind of app entry is written under.
export async function saveRules(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const t = await say();

  try {
    await db.transaction(async (tx) => {
      const heads = new Set((await tx.select({ id: daybookHead.id }).from(daybookHead)).map((head) => head.id));
      const current = new Map((await tx.select().from(daybookRule)).map((rule) => [rule.kind, rule.head]));
      for (const kind of KINDS) {
        const head = text(formData, `rule.${kind.key}`);
        if (!heads.has(head) || current.get(kind.key) === head) continue;
        await tx.insert(daybookRule).values({ kind: kind.key, head })
          .onConflictDoUpdate({ target: daybookRule.kind, set: { head, updatedAt: new Date() } });
        await logAudit(tx, user.id, {
          tableName: "daybook_rule", recordId: head, action: "update",
          oldValues: { kind: kind.key, head: current.get(kind.key) ?? null }, newValues: { kind: kind.key, head },
        });
      }
    });
  } catch (error) {
    return fail(error, t.failed);
  }

  revalidateSettings();
  return { success: t.saved };
}

export async function saveInvocation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const t = await say();
  // One invocation line to a line, with no blank ones between.
  const invocation = String(formData.get("invocation") ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n");
  const showInvocation = formData.get("show") === "on";
  if (!invocation && showInvocation) return { error: t.needText };

  try {
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(daybookSettings).where(eq(daybookSettings.id, 1)).for("update");
      const values = { invocation: invocation || old?.invocation || "", showInvocation, updatedAt: new Date() };
      const [row] = await tx.insert(daybookSettings).values({ id: 1, ...values })
        .onConflictDoUpdate({ target: daybookSettings.id, set: values })
        .returning();
      await logAudit(tx, user.id, { tableName: "daybook_settings", recordId: SETTINGS_RECORD, action: "update", oldValues: old, newValues: row });
    });
  } catch (error) {
    return fail(error, t.failed);
  }

  revalidateSettings();
  return { success: t.saved };
}
