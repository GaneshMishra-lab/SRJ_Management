"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { daybookEntry } from "@/db/schema/daybook";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { getHeads } from "@/lib/daybook/data";
import { parseEntry } from "@/lib/daybook/entry";
import type { EntryValues } from "@/lib/daybook/entry";
import type { EntryInput, Head } from "@/lib/daybook/types";
import { entryDate, isUuid } from "@/lib/form";
import { istDate, parseDbDate } from "@/lib/format";
import { eraseCash, mayCorrect, recordCash, rewriteCash } from "@/lib/ledger";

// What went wrong, as a word the page says in the reader's language. "owner": the entry is of
// an earlier day, which only the owner may change.
export type DaybookResult = { error?: "invalid" | "missing" | "owner" | "failed"; id?: string };

function revalidateBook() {
  revalidatePath("/daybook");
  revalidatePath("/ledgers");
  revalidatePath("/dashboard");
}

// The cash ledger's side of a typed line: in under a जमा head, out under a नावे head; the drawer
// for cash, the bank account for anything else.
const cashOf = (input: EntryInput, head: Head, date: string) => ({
  direction: head.side === "credit" ? "in" as const : "out" as const,
  amt: input.amt,
  location: input.mode === "cash" ? "vault" as const : "account" as const,
  desc: `Day book: ${head.nameEn}${input.party ? ` - ${input.party}` : ""}`,
  date,
});

const rowOf = (input: EntryInput, date: string) => ({
  date,
  head: input.headId,
  party: input.party,
  weight: input.weight,
  purity: input.purity,
  rate: input.rate,
  amt: input.amt,
  mode: input.mode,
  note: input.note,
  extraData: input.extra,
});

// Saves a line typed into the day book, new or changed, together with its cash ledger entry.
export async function saveDaybookEntry(values: EntryValues, id?: string): Promise<DaybookResult> {
  const user = await getCurrentUser();
  if (id !== undefined && !isUuid(id)) return { error: "missing" };

  const heads = await getHeads();
  const parsed = parseEntry(values, heads, istDate());
  if (parsed.errors) return { error: "invalid" };
  const input = parsed.input;
  const head = heads.find((h) => h.id === input.headId)!;

  try {
    const saved = await db.transaction(async (tx) => {
      if (!id) {
        const date = entryDate(input.day);
        const [row] = await tx.insert(daybookEntry).values(rowOf(input, date)).returning();
        await recordCash(tx, { ...cashOf(input, head, date), sourceTable: "daybook_entry", sourceId: row.id });
        await logAudit(tx, user.id, { tableName: "daybook_entry", recordId: row.id, action: "insert", newValues: row });
        return row;
      }

      const [old] = await tx.select().from(daybookEntry).where(eq(daybookEntry.id, id)).for("update");
      if (!old) return "missing";
      // An entry left on its day keeps its place among that day's lines.
      const date = istDate(parseDbDate(old.date)) === input.day ? old.date : entryDate(input.day);
      if (!mayCorrect(user.role, old.date, date)) return "owner";
      const [row] = await tx.update(daybookEntry).set({ ...rowOf(input, date), updatedAt: new Date() }).where(eq(daybookEntry.id, id)).returning();
      await rewriteCash(tx, "daybook_entry", id, cashOf(input, head, date));
      await logAudit(tx, user.id, { tableName: "daybook_entry", recordId: id, action: "update", oldValues: old, newValues: row });
      return row;
    });
    if (typeof saved === "string") return { error: saved };
    revalidateBook();
    return { id: saved.id };
  } catch (error) {
    console.error("Could not save the day book entry.", error);
    return { error: "failed" };
  }
}

// Removes a typed line and the cash ledger entry it made.
export async function deleteDaybookEntry(id: string): Promise<DaybookResult> {
  const user = await getCurrentUser();
  if (!isUuid(id)) return { error: "missing" };

  try {
    const refused = await db.transaction(async (tx) => {
      const [old] = await tx.select().from(daybookEntry).where(eq(daybookEntry.id, id)).for("update");
      if (!old) return "missing";
      if (!mayCorrect(user.role, old.date)) return "owner";
      await tx.delete(daybookEntry).where(eq(daybookEntry.id, id));
      await eraseCash(tx, "daybook_entry", id);
      await logAudit(tx, user.id, { tableName: "daybook_entry", recordId: id, action: "delete", oldValues: old });
      return null;
    });
    if (refused) return { error: refused };
    revalidateBook();
    return {};
  } catch (error) {
    console.error("Could not delete the day book entry.", error);
    return { error: "failed" };
  }
}
