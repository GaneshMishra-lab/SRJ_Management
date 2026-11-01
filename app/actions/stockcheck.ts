"use server";

import { and, desc, eq, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { stockCheck, stockCheckLine } from "@/db/schema/stockcheck";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { fail, FormState, text, UserError } from "@/lib/form";
import { istDate } from "@/lib/format";
import { checkMetals, checkSources } from "@/lib/stockcheck";

// Records a stock check: for every row, what was counted and how many of those are in the locker.
// The book figures are worked out again here, never taken from the form. Checking again on the same
// day replaces that day's check; an earlier day's check is kept as it was written.
export async function saveStockCheck(kind: string, metal: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const source = checkSources[kind];
  const day = text(formData, "date") || istDate();
  const note = text(formData, "note");

  if (!source) return { error: "This kind of stock cannot be checked yet." };
  if (!(checkMetals as readonly string[]).includes(metal)) return { error: "Choose gold or silver." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > istDate()) return { error: "Choose today or an earlier date." };

  // A count left empty is an error, not a zero: an empty box is written as 0.
  const count = (name: string, label: string) => {
    const raw = text(formData, name);
    const value = Number(raw);
    if (raw === "" || !Number.isInteger(value) || value < 0) throw new UserError(`Enter the ${label} as a whole number.`);
    return value;
  };

  let replaced = false;
  let differ = 0;
  try {
    await db.transaction(async (tx) => {
      // Lock the day's check, if there is one, so two people saving at once cannot both write it.
      const [existing] = await tx.select().from(stockCheck)
        .where(and(eq(stockCheck.kind, kind), eq(stockCheck.metal, metal), eq(stockCheck.date, day)))
        .for("update");
      if (existing && day !== istDate()) throw new UserError("This day's check is already recorded. Only today's check can be changed.");

      const [before] = await tx.select({ date: stockCheck.date }).from(stockCheck)
        .where(and(eq(stockCheck.kind, kind), eq(stockCheck.metal, metal), lt(stockCheck.date, day)))
        .orderBy(desc(stockCheck.date))
        .limit(1);
      const book = await source.book(tx, metal, day, before?.date ?? null);

      const lines = book.map((row) => {
        const counted = count(`counted:${row.id}`, `count for ${row.name}`);
        const locker = count(`locker:${row.id}`, `locker count for ${row.name}`);
        if (locker > counted) throw new UserError(`${row.name}: the locker cannot hold more than was counted.`);
        if (counted !== row.expected - row.away) differ += 1;
        return { subjectId: row.id, subjectName: row.name, added: row.added, removed: row.removed, expected: row.expected, away: row.away, counted, locker };
      });

      let check;
      let oldValues;
      if (existing) {
        replaced = true;
        const oldLines = await tx.delete(stockCheckLine).where(eq(stockCheckLine.check, existing.id)).returning();
        oldValues = { ...existing, lines: oldLines };
        [check] = await tx.update(stockCheck).set({ note: note || null, checkedBy: user.id, updatedAt: new Date() })
          .where(eq(stockCheck.id, existing.id)).returning();
      } else {
        [check] = await tx.insert(stockCheck).values({ kind, metal, date: day, note: note || null, checkedBy: user.id }).returning();
      }
      const saved = lines.length ? await tx.insert(stockCheckLine).values(lines.map((line) => ({ ...line, check: check.id }))).returning() : [];
      await logAudit(tx, user.id, { tableName: "stock_check", recordId: check.id, action: existing ? "update" : "insert", oldValues, newValues: { ...check, lines: saved } });
    });
  } catch (error) {
    return fail(error, "Could not record the stock check.");
  }

  revalidatePath("/stock-check");
  const outcome = differ === 0 ? "Everything matches the book." : `${differ} ${differ === 1 ? "row differs" : "rows differ"} from the book.`;
  return { success: `${replaced ? "Check updated" : "Check recorded"}. ${outcome}` };
}
