"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dailyBalance, dailyRate, expense } from "@/db/schema/ledger";
import { getCurrentUser, logAudit, requireOwner } from "@/lib/dal";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { istDate, istDayRange, parseDbDate } from "@/lib/format";
import { cashBalances, cashCausedBy, eraseCash, isCashMode, locationFor, mayCorrect, recordCash, rewriteCash } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";

const isLocation = (value: string): value is "vault" | "account" => value === "vault" || value === "account";
const locationName = { vault: "vault", account: "bank account" };
const expenseNote = (category: string, desc: string) => `Expense: ${category}${desc ? ` - ${desc}` : ""}`;
const ownersDay = "Only the owner can change an entry of an earlier day.";

// When a corrected entry happened. Left on its day (or sent with no day) it keeps its time, and
// so its place among that day's entries; moved to another day it is timed as a new entry would be.
function keptDate(old: string | null, formData: FormData) {
  const day = text(formData, "date");
  return old && (!day || istDate(parseDbDate(old)) === day) ? old : entryDate(formData);
}

function revalidateCash() {
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
}

export async function setDailyRates(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const rates = [
    { metal: "Gold", rate: round2(num(formData, "gold")) },
    { metal: "Silver", rate: round2(num(formData, "silver")) },
  ].filter((r) => r.rate > 0);
  if (rates.length === 0) return { error: "Enter at least one rate." };
  // A missed day's rate can be filled in later, so bills written up for that day find it.
  const today = istDate();
  const date = text(formData, "date") || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return { error: "Choose today or an earlier date." };

  try {
    for (const { metal, rate } of rates) {
      const [row] = await db.insert(dailyRate)
        .values({ date, metal, rate })
        .onConflictDoUpdate({
          target: [dailyRate.date, dailyRate.metal],
          set: { rate, updatedAt: new Date() },
        })
        .returning();
      await logAudit(db, user.id, { tableName: "daily_rate", recordId: row.id, action: "update", newValues: row });
    }
  } catch (error) {
    return fail(error, "Could not save the rates.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/sales/new");
  return { success: date === today ? "Today's rates saved." : "Rates saved for that day." };
}

export async function addExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const category = text(formData, "category");
  const desc = text(formData, "desc");
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");

  if (!category) return { error: "Choose a category." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose how it was paid." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const location = locationFor(mode);
      const [row] = await tx.insert(expense).values({
        date,
        category,
        desc: desc || null,
        amt,
        mode,
        location,
      }).returning();

      await recordCash(tx, {
        direction: "out",
        amt,
        location,
        sourceTable: "expense",
        sourceId: row.id,
        desc: expenseNote(category, desc),
        date,
      });
      await logAudit(tx, user.id, { tableName: "expense", recordId: row.id, action: "insert", newValues: row });
    });
  } catch (error) {
    return fail(error, "Could not save the expense.");
  }

  revalidateCash();
  return { success: "Expense recorded." };
}

// An expense entered wrongly is corrected in place, and its ledger entry with it.
export async function editExpense(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const category = text(formData, "category");
  const desc = text(formData, "desc");
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");

  if (!isUuid(id)) return { error: "That expense was not found." };
  if (!category) return { error: "Choose a category." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose how it was paid." };

  try {
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(expense).where(eq(expense.id, id)).for("update");
      if (!old) throw new UserError("That expense was not found.");
      const date = keptDate(old.date, formData);
      if (!mayCorrect(user.role, old.date, date)) throw new UserError(ownersDay);
      const location = locationFor(mode);
      const [row] = await tx.update(expense)
        .set({ date, category, desc: desc || null, amt, mode, location, updatedAt: new Date() })
        .where(eq(expense.id, id))
        .returning();

      await rewriteCash(tx, "expense", id, { direction: "out", amt, location, desc: expenseNote(category, desc), date });
      await logAudit(tx, user.id, { tableName: "expense", recordId: id, action: "update", oldValues: old, newValues: row });
    });
  } catch (error) {
    return fail(error, "Could not save the expense.");
  }

  revalidateCash();
  return { success: "Expense corrected." };
}

export async function deleteExpense(id: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(id)) return { error: "That expense was not found." };

  try {
    await db.transaction(async (tx) => {
      const [old] = await tx.delete(expense).where(eq(expense.id, id)).returning();
      if (!old) throw new UserError("That expense was not found.");
      if (!mayCorrect(user.role, old.date)) throw new UserError(ownersDay);
      await eraseCash(tx, "expense", id);
      await logAudit(tx, user.id, { tableName: "expense", recordId: id, action: "delete", oldValues: old });
    });
  } catch (error) {
    return fail(error, "Could not delete the expense.");
  }

  revalidateCash();
  return { success: "Expense deleted." };
}

// Deposit to or withdrawal from the bank: one entry out, one entry in, sharing a source id.
export async function transferCash(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const from = text(formData, "from");
  const amt = round2(num(formData, "amt"));

  if (!isLocation(from)) return { error: "Choose where the money moved from." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  const to = from === "vault" ? "account" : "vault";

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const transferId = randomUUID();
      const desc = `Transfer from ${locationName[from]} to ${locationName[to]}`;
      const out = await recordCash(tx, { direction: "out", amt, location: from, sourceTable: "transfer", sourceId: transferId, desc, date });
      await recordCash(tx, { direction: "in", amt, location: to, sourceTable: "transfer", sourceId: transferId, desc, date });
      await logAudit(tx, user.id, { tableName: "cash_ledger", recordId: out.id, action: "insert", newValues: { transferId, from, to, amt, date } });
    });
  } catch (error) {
    return fail(error, "Could not record the transfer.");
  }

  revalidateCash();
  return { success: "Transfer recorded." };
}

// A transfer's amount or day is corrected on both of its entries at once. Which way the money
// went is not changed; a transfer entered the wrong way round is deleted and entered again.
export async function editTransfer(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));

  if (!isUuid(id)) return { error: "That transfer was not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };

  try {
    await db.transaction(async (tx) => {
      const [old] = await cashCausedBy(tx, "transfer", id).for("update");
      if (!old) throw new UserError("That transfer was not found.");
      const date = keptDate(old.date, formData);
      if (!mayCorrect(user.role, old.date, date)) throw new UserError(ownersDay);
      await rewriteCash(tx, "transfer", id, { amt, date });
      await logAudit(tx, user.id, {
        tableName: "cash_ledger",
        recordId: old.id,
        action: "update",
        oldValues: { transferId: id, amt: old.amt, date: old.date },
        newValues: { transferId: id, amt, date },
      });
    });
  } catch (error) {
    return fail(error, "Could not save the transfer.");
  }

  revalidateCash();
  return { success: "Transfer corrected." };
}

export async function deleteTransfer(id: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(id)) return { error: "That transfer was not found." };

  try {
    await db.transaction(async (tx) => {
      const legs = await eraseCash(tx, "transfer", id);
      if (legs.length === 0) throw new UserError("That transfer was not found.");
      if (!mayCorrect(user.role, legs[0].date)) throw new UserError(ownersDay);
      await logAudit(tx, user.id, { tableName: "cash_ledger", recordId: legs[0].id, action: "delete", oldValues: legs });
    });
  } catch (error) {
    return fail(error, "Could not delete the transfer.");
  }

  revalidateCash();
  return { success: "Transfer deleted." };
}

// Opening balances and corrections. Owner only.
export async function adjustCash(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const location = text(formData, "location");
  const direction = text(formData, "direction");
  const amt = round2(num(formData, "amt"));
  const desc = text(formData, "desc");

  if (!isLocation(location)) return { error: "Choose vault or bank account." };
  if (direction !== "in" && direction !== "out") return { error: "Choose add or remove." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!desc) return { error: "Write the reason for this adjustment." };

  try {
    await db.transaction(async (tx) => {
      const row = await recordCash(tx, { direction, amt, location, sourceTable: "adjustment", desc: `Adjustment: ${desc}` });
      await logAudit(tx, owner.id, { tableName: "cash_ledger", recordId: row.id, action: "insert", newValues: row });
    });
  } catch (error) {
    return fail(error, "Could not record the adjustment.");
  }

  revalidateCash();
  return { success: "Adjustment recorded." };
}

// Day-end tally: hand-counted closing against what the ledger says. The ledger itself is not changed.
export async function closeDay(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const day = text(formData, "date");
  const location = text(formData, "location");
  const actualClosing = round2(num(formData, "actual"));
  const remarks = text(formData, "remarks");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > istDate()) return { error: "Choose today or an earlier date." };
  if (!isLocation(location)) return { error: "Choose vault or bank account." };
  if (formData.get("actual") === null || text(formData, "actual") === "" || actualClosing < 0) {
    return { error: "Enter the counted closing amount." };
  }

  try {
    const { start, end } = istDayRange(day);
    const openingBalance = (await cashBalances(start))[location];
    const computedClosing = (await cashBalances(end))[location];
    const values = {
      openingBalance,
      computedClosing,
      actualClosing,
      discrepancy: round2(actualClosing - computedClosing),
      remarks: remarks || null,
    };

    const [row] = await db.insert(dailyBalance)
      .values({ date: start, location, ...values })
      .onConflictDoUpdate({
        target: [dailyBalance.date, dailyBalance.location],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    await logAudit(db, user.id, { tableName: "daily_balance", recordId: row.id, action: "update", newValues: row });
  } catch (error) {
    return fail(error, "Could not save the closing.");
  }

  revalidatePath("/ledgers");
  return { success: "Closing saved." };
}
