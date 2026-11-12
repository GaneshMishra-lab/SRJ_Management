"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { resolveEntity } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { dateOnly, inr, istDate, istTime, parseDbDate } from "@/lib/format";
import { cashCausedBy, eraseCash, isCashMode, isTypedLoanEntry, locationFor, mayCorrect, recordCash, rewriteCash } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";
import { payOldDues } from "@/lib/sale-payments";

const signed = (amt: typeof loanEntry.amt | typeof lendEntry.amt, type: typeof loanEntry.type | typeof lendEntry.type) =>
  sql<number>`coalesce(sum(case when ${type} = 'repayment' then -${amt} else ${amt} end), 0)`.mapWith(Number);

// kind "loan": money the shop gave. kind "lend": money the shop took.
// Each entity has one running account of each kind; every movement is a dated line.
export async function addLoanEntry(kind: "loan" | "lend", _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const repayment = text(formData, "type") === "repayment";
  const whole = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  const note = text(formData, "note") || null;
  const remindOn = text(formData, "remindOn");
  if (whole <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };
  if (remindOn && !isDay(remindOn)) return { error: "Choose a reminder date." };

  let done = "Recorded.";
  try {
    await db.transaction(async (tx) => {
      const party = await resolveEntity(tx, user.id, formData, "customer");
      const date = entryDate(formData);
      let entryId: string;
      let balance: number;
      let amt = whole;

      // Money left with the shop by someone who owes it anything (sale bills, a loan, a repair) is
      // udhari paid, not a deposit: it pays those first, oldest first, and only what is left is held.
      if (kind === "lend" && !repayment) {
        const { paid, left } = await payOldDues(tx, user.id, party, amt, mode, date);
        if (paid > 0) done = left > 0 ? `${inr(paid)} paid on what this person owes, ${inr(left)} recorded as borrowed.` : `All ${inr(paid)} paid on what this person owes; nothing borrowed.`;
        if (left <= 0) return;
        amt = left;
      }

      if (kind === "loan") {
        const [account] = await tx.insert(loan).values({ borrower: party, remindOn: remindOn || null })
          .onConflictDoUpdate({ target: loan.borrower, set: { updatedAt: new Date(), ...(remindOn ? { remindOn } : {}) } }).returning();
        [{ balance }] = await tx.select({ balance: signed(loanEntry.amt, loanEntry.type) }).from(loanEntry).where(eq(loanEntry.loan, account.id));
        if (repayment && amt > balance) throw new UserError("That is more than what this person owes the shop.");
        const [entry] = await tx.insert(loanEntry).values({ loan: account.id, date, type: repayment ? "repayment" : "given", amt, mode, note }).returning();
        entryId = entry.id;
      } else {
        const [account] = await tx.insert(lend).values({ lender: party, remindOn: remindOn || null })
          .onConflictDoUpdate({ target: lend.lender, set: { updatedAt: new Date(), ...(remindOn ? { remindOn } : {}) } }).returning();
        [{ balance }] = await tx.select({ balance: signed(lendEntry.amt, lendEntry.type) }).from(lendEntry).where(eq(lendEntry.lend, account.id));
        if (repayment && amt > balance) throw new UserError("That is more than what the shop owes this person.");
        const [entry] = await tx.insert(lendEntry).values({ lend: account.id, date, type: repayment ? "repayment" : "taken", amt, mode, note }).returning();
        entryId = entry.id;
      }

      // Giving a loan and repaying a borrowing send money out; the other two bring it in.
      const out = (kind === "loan") !== repayment;
      const table = kind === "loan" ? "loan_entry" : "lend_entry";
      await recordCash(tx, {
        direction: out ? "out" : "in", amt, location: locationFor(mode), sourceTable: table, sourceId: entryId, date,
        desc: cashDesc(kind, repayment),
      });
      await logAudit(tx, user.id, { tableName: table, recordId: entryId, action: "insert", newValues: { kind, party, repayment, amt, mode, note, remindOn: remindOn || undefined } });
    });
  } catch (error) {
    return fail(error, "Could not record the entry.");
  }

  revalidateLoans();
  return { success: done };
}

function revalidateLoans() {
  revalidatePath("/loans");
  revalidatePath("/loans/[kind]/[id]", "page");
  revalidatePath("/sales");
  revalidatePath("/repairs");
  revalidatePath("/parties");
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

const cashDesc = (kind: "loan" | "lend", repayment: boolean) => kind === "loan"
  ? (repayment ? "Loan repayment received" : "Loan given")
  : (repayment ? "Borrowing repaid" : "Money borrowed");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// One line of an account, locked, with the account it is on. kind "given" is a loan, "taken" a borrowing.
async function lockedEntry(tx: Tx, kind: "given" | "taken", entryId: string) {
  if (kind === "given") {
    const [entry] = await tx.select().from(loanEntry).where(eq(loanEntry.id, entryId)).for("update");
    if (!entry) throw new UserError("Entry not found.");
    return { entry, account: entry.loan, sourceTable: "loan_entry" };
  }
  const [entry] = await tx.select().from(lendEntry).where(eq(lendEntry.id, entryId)).for("update");
  if (!entry) throw new UserError("Entry not found.");
  return { entry, account: entry.lend, sourceTable: "lend_entry" };
}

// What is left on the account once a change is made. It may not go below nothing: repayments
// cannot be more than was lent, nor more paid back (or spent) than was borrowed.
async function checkBalance(tx: Tx, kind: "given" | "taken", account: string) {
  const [{ balance }] = kind === "given"
    ? await tx.select({ balance: signed(loanEntry.amt, loanEntry.type) }).from(loanEntry).where(eq(loanEntry.loan, account))
    : await tx.select({ balance: signed(lendEntry.amt, lendEntry.type) }).from(lendEntry).where(eq(lendEntry.lend, account));
  if (balance < -0.005) {
    throw new UserError(kind === "given"
      ? `After this change the repayments would be ${inr(-balance)} more than was lent. Correct or remove a repayment first.`
      : `After this change ${inr(-balance)} more would be paid back or used than was borrowed. Correct that line first.`);
  }
}

// Corrects a line entered by mistake (wrong side, amount, mode, day or note) in place, along with
// its cash ledger entry, so the day book reads as if it had been typed right. Today's lines are
// anyone's to put right; an earlier day's are the owner's, as everywhere else in the cash book.
export async function editLoanEntry(kind: "given" | "taken", entryId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(entryId) || (kind !== "given" && kind !== "taken")) return { error: "Entry not found." };
  const books = kind === "given" ? "loan" : "lend";
  const repayment = text(formData, "type") === "repayment";
  const amt = round2(num(formData, "amt"));
  const note = text(formData, "note") || null;
  if (amt <= 0) return { error: "Enter an amount above zero." };

  let accountId: string;
  try {
    accountId = await db.transaction(async (tx) => {
      const { entry, account, sourceTable } = await lockedEntry(tx, kind, entryId);
      if (!isTypedLoanEntry(entry.mode)) throw new UserError("This line was written by a sale bill or a BC. Correct it there.");
      // An opening balance moved no cash and stays that way; the others may switch between cash and online.
      const mode = entry.mode === "opening" ? "opening" : text(formData, "mode");
      if (mode !== "opening" && !isCashMode(mode)) throw new UserError("Choose cash or online.");

      // The day and time as they were shown: left alone, the line keeps its exact moment.
      const was = entry.date ? parseDbDate(entry.date) : null;
      const clock = text(formData, "time");
      const unchanged = was && text(formData, "date") === istDate(was) && (!clock || clock === istTime(was).slice(0, 5));
      const date = unchanged && entry.date ? entry.date : entryDate(formData);
      if (!mayCorrect(user.role, entry.date, date)) throw new UserError("Only the owner can change an entry of an earlier day.");

      const type = repayment ? "repayment" : kind === "given" ? "given" : "taken";
      const values = { type, amt, mode, note, date, updatedAt: new Date() };
      const [row] = kind === "given"
        ? await tx.update(loanEntry).set(values).where(eq(loanEntry.id, entryId)).returning()
        : await tx.update(lendEntry).set(values).where(eq(lendEntry.id, entryId)).returning();
      await checkBalance(tx, kind, account);

      // Giving a loan and repaying a borrowing send money out; the other two bring it in.
      const out = (kind === "given") !== repayment;
      const before = await cashCausedBy(tx, sourceTable, entryId);
      if (mode === "opening") {
        if (before.length > 0) await eraseCash(tx, sourceTable, entryId);
      } else {
        const cash = { direction: out ? "out" as const : "in" as const, amt, location: locationFor(mode), desc: cashDesc(books, repayment), date };
        if (before.length > 0) await rewriteCash(tx, sourceTable, entryId, cash);
        else await recordCash(tx, { ...cash, sourceTable, sourceId: entryId });
      }

      await logAudit(tx, user.id, { tableName: sourceTable, recordId: entryId, action: "update", oldValues: entry, newValues: row });
      return account;
    });
  } catch (error) {
    return fail(error, "Could not correct the entry.");
  }

  revalidateLoans();
  redirect(`/loans/${kind}/${accountId}`);
}

// Removes a line entered by mistake, and the cash ledger entry it made. Same rule as above.
export async function deleteLoanEntry(kind: "given" | "taken", entryId: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(entryId) || (kind !== "given" && kind !== "taken")) return { error: "Entry not found." };

  try {
    await db.transaction(async (tx) => {
      const { entry, account, sourceTable } = await lockedEntry(tx, kind, entryId);
      if (!isTypedLoanEntry(entry.mode)) throw new UserError("This line was written by a sale bill or a BC. Undo it there.");
      if (!mayCorrect(user.role, entry.date)) throw new UserError("Only the owner can remove an entry of an earlier day.");
      if (kind === "given") await tx.delete(loanEntry).where(eq(loanEntry.id, entryId));
      else await tx.delete(lendEntry).where(eq(lendEntry.id, entryId));
      await checkBalance(tx, kind, account);
      await eraseCash(tx, sourceTable, entryId);
      await logAudit(tx, user.id, { tableName: sourceTable, recordId: entryId, action: "delete", oldValues: entry });
    });
  } catch (error) {
    return fail(error, "Could not remove the entry.");
  }

  revalidateLoans();
  return { success: "Entry removed." };
}

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

// Sets, moves or clears the day to chase an account. From that day, while anything is still open on
// it, the account is flagged in the sidebar, on the dashboard and on the Loans page.
export async function setLoanReminder(kind: "given" | "taken", id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const clear = formData.get("clear") === "on";
  const remindOn = clear ? null : text(formData, "remindOn");
  if (!isUuid(id) || (kind !== "given" && kind !== "taken")) return { error: "Account not found." };
  if (remindOn !== null && !isDay(remindOn)) return { error: "Choose a reminder date, or tick to clear it." };

  try {
    await db.transaction(async (tx) => {
      const table = kind === "given" ? loan : lend;
      const [before] = await tx.select({ remindOn: table.remindOn }).from(table).where(eq(table.id, id)).for("update");
      if (!before) throw new UserError("Account not found.");
      await tx.update(table).set({ remindOn, updatedAt: new Date() }).where(eq(table.id, id));
      await logAudit(tx, user.id, {
        tableName: kind === "given" ? "loan" : "lend", recordId: id, action: "update",
        oldValues: { remindOn: before.remindOn }, newValues: { remindOn },
      });
    });
  } catch (error) {
    return fail(error, "Could not save the reminder.");
  }

  revalidatePath("/loans");
  revalidatePath("/loans/[kind]/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  return { success: remindOn ? `Reminder set for ${dateOnly(remindOn)}.` : "Reminder cleared." };
}
