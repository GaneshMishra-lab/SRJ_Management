"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { resolveEntity } from "@/lib/entities";
import { entryDate, fail, FormState, num, text, UserError } from "@/lib/form";
import { inr } from "@/lib/format";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
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
  if (whole <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

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
        const [account] = await tx.insert(loan).values({ borrower: party })
          .onConflictDoUpdate({ target: loan.borrower, set: { updatedAt: new Date() } }).returning();
        [{ balance }] = await tx.select({ balance: signed(loanEntry.amt, loanEntry.type) }).from(loanEntry).where(eq(loanEntry.loan, account.id));
        if (repayment && amt > balance) throw new UserError("That is more than what this person owes the shop.");
        const [entry] = await tx.insert(loanEntry).values({ loan: account.id, date, type: repayment ? "repayment" : "given", amt, mode }).returning();
        entryId = entry.id;
      } else {
        const [account] = await tx.insert(lend).values({ lender: party })
          .onConflictDoUpdate({ target: lend.lender, set: { updatedAt: new Date() } }).returning();
        [{ balance }] = await tx.select({ balance: signed(lendEntry.amt, lendEntry.type) }).from(lendEntry).where(eq(lendEntry.lend, account.id));
        if (repayment && amt > balance) throw new UserError("That is more than what the shop owes this person.");
        const [entry] = await tx.insert(lendEntry).values({ lend: account.id, date, type: repayment ? "repayment" : "taken", amt, mode }).returning();
        entryId = entry.id;
      }

      // Giving a loan and repaying a borrowing send money out; the other two bring it in.
      const out = (kind === "loan") !== repayment;
      const table = kind === "loan" ? "loan_entry" : "lend_entry";
      await recordCash(tx, {
        direction: out ? "out" : "in", amt, location: locationFor(mode), sourceTable: table, sourceId: entryId, date,
        desc: kind === "loan"
          ? (repayment ? "Loan repayment received" : "Loan given")
          : (repayment ? "Borrowing repaid" : "Money borrowed"),
      });
      await logAudit(tx, user.id, { tableName: table, recordId: entryId, action: "insert", newValues: { kind, party, repayment, amt, mode } });
    });
  } catch (error) {
    return fail(error, "Could not record the entry.");
  }

  revalidatePath("/loans");
  revalidatePath("/loans/[kind]/[id]", "page");
  revalidatePath("/sales");
  revalidatePath("/repairs");
  revalidatePath("/parties");
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
  return { success: done };
}
