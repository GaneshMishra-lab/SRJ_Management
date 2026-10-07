"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { goldLoan, goldLoanPayment, oldItem } from "@/db/schema/sales";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { resolveEntity, Tx } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { istDate, parseDbDate } from "@/lib/format";
import { accruedInterest } from "@/lib/interest";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2, round3 } from "@/lib/pricing";

function revalidateLoans(id?: string) {
  revalidatePath("/gold-loans");
  if (id) revalidatePath(`/gold-loans/${id}`);
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
}

export async function createGoldLoan(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const item = text(formData, "item");
  const desc = text(formData, "desc");
  const weight = round3(num(formData, "weight"));
  const amt = round2(num(formData, "amt"));
  const interest = round3(num(formData, "interest"));
  const mode = text(formData, "mode");

  if (!item) return { error: "List what is being pledged." };
  if (weight <= 0 || amt <= 0) return { error: "Enter the pledged weight and the loan amount." };
  if (interest < 0 || interest > 100) return { error: "Interest must be a monthly percentage." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const customer = await resolveEntity(tx, user.id, formData, "customer");
      const [loan] = await tx.insert(goldLoan).values({
        customer, item, desc: desc || null, weight, date,
        amt, amtPaid: 0, interest, status: "active",
      }).returning();
      await recordCash(tx, {
        direction: "out", amt, location: locationFor(mode),
        sourceTable: "gold_loan", sourceId: loan.id, desc: `Gold loan given against ${item}`, date,
      });
      await logAudit(tx, user.id, { tableName: "gold_loan", recordId: loan.id, action: "insert", newValues: loan });
    });
  } catch (error) {
    return fail(error, "Could not save the gold loan.");
  }

  revalidateLoans();
  return { success: "Gold loan given." };
}

// Locks the loan and works out where it stood at the time of the entry being made.
async function loanPosition(tx: Tx, id: string, at: string) {
  const [loan] = await tx.select().from(goldLoan).where(eq(goldLoan.id, id)).for("update");
  if (!loan) throw new UserError("Gold loan not found.");
  if (loan.date && istDate(parseDbDate(at)) < istDate(parseDbDate(loan.date))) {
    throw new UserError("That date is before the loan was given.");
  }
  const payments = await tx.select().from(goldLoanPayment).where(eq(goldLoanPayment.loan, id));
  const interestPaid = payments.filter((p) => p.type === "interest").reduce((sum, p) => sum + (p.amt ?? 0), 0);
  const accrued = accruedInterest(loan, payments.filter((p) => p.type === "principal"), parseDbDate(at));
  return {
    loan,
    principalDue: round2((loan.amt ?? 0) - (loan.amtPaid ?? 0)),
    interestDue: Math.max(0, round2(accrued - interestPaid)),
  };
}

export async function addGoldLoanPayment(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const type = text(formData, "type");
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  if (!isUuid(id)) return { error: "Gold loan not found." };
  if (type !== "interest" && type !== "principal") return { error: "Choose interest or principal." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const { loan, principalDue } = await loanPosition(tx, id, date);
      if (loan.status !== "active") throw new UserError("This loan is no longer active.");
      if (type === "principal" && amt > principalDue) throw new UserError("That is more than the principal still due.");

      const [payment] = await tx.insert(goldLoanPayment).values({
        loan: id, date, amt, type, mode, desc: text(formData, "desc") || null,
      }).returning();
      if (type === "principal") {
        const amtPaid = round2((loan.amtPaid ?? 0) + amt);
        // Fully repaid principal closes the loan and releases the pledge.
        await tx.update(goldLoan)
          .set({ amtPaid, status: amtPaid >= (loan.amt ?? 0) ? "closed" : "active", updatedAt: new Date() })
          .where(eq(goldLoan.id, id));
      }
      await recordCash(tx, {
        direction: "in", amt, location: locationFor(mode),
        sourceTable: "gold_loan_payment", sourceId: payment.id, desc: `Gold loan ${type} received`, date,
      });
      await logAudit(tx, user.id, { tableName: "gold_loan_payment", recordId: payment.id, action: "insert", newValues: payment });
    });
  } catch (error) {
    return fail(error, "Could not record the payment.");
  }

  revalidateLoans(id);
  return { success: "Payment recorded." };
}

// A defaulted pledge becomes the shop's old metal, valued at principal plus unpaid interest.
export async function defaultGoldLoan(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const metal = text(formData, "metal");
  const melting = round3(num(formData, "melting"));
  if (!isUuid(id)) return { error: "Gold loan not found." };
  if (!["Gold", "Silver", "Phuli"].includes(metal)) return { error: "Choose the metal of the pledge." };
  if (melting <= 0 || melting > 100) return { error: "Melting must be between 0 and 100." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const { loan, principalDue, interestDue } = await loanPosition(tx, id, date);
      const [updated] = await tx.update(goldLoan)
        .set({ status: "defaulted", updatedAt: new Date() })
        .where(and(eq(goldLoan.id, id), eq(goldLoan.status, "active")))
        .returning();
      if (!updated) throw new UserError("This loan is no longer active.");

      const value = round2(principalDue + interestDue);
      const [old] = await tx.insert(oldItem).values({
        customer: loan.customer, date, weight: loan.weight, metal, melting,
        amt: value, paidAmt: value, goldLoan: id, status: "vault",
      }).returning();
      await logAudit(tx, user.id, { tableName: "gold_loan", recordId: id, action: "update", oldValues: { status: "active" }, newValues: { status: "defaulted", oldItem: old.id, value } });
    });
  } catch (error) {
    return fail(error, "Could not mark the loan as defaulted.");
  }

  revalidateLoans(id);
  revalidatePath("/old-gold");
  return { success: "Pledge moved to old metal." };
}
