"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { goldLoan, goldLoanPayment, oldItem } from "@/db/schema/sales";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { resolveEntity, Tx } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { inr, istDate, parseDbDate } from "@/lib/format";
import { loanFigures } from "@/lib/interest";
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
  return { loan, ...loanFigures(loan, payments, parseDbDate(at)) };
}

export async function addGoldLoanPayment(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const type = text(formData, "type");
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  if (!isUuid(id)) return { error: "Gold loan not found." };
  if (type !== "interest" && type !== "principal" && type !== "penalty") return { error: "Choose interest, principal or penalty." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const { loan, principalDue, penaltyDue } = await loanPosition(tx, id, date);
      if (loan.status !== "active") throw new UserError("This loan is no longer active.");
      if (type === "penalty" && amt > penaltyDue) throw new UserError(`That is more than the ${inr(penaltyDue)} of penalty due.`);
      if (type === "principal" && amt > principalDue) throw new UserError("That is more than the principal still due.");
      // Paying off the whole principal is a clearance, so the interest is settled with it.
      if (type === "principal" && amt === principalDue) throw new UserError("That pays off the whole loan. Use \"Clear girvi\" to settle it with its interest.");

      const [payment] = await tx.insert(goldLoanPayment).values({
        loan: id, date, amt, type, mode, desc: text(formData, "desc") || null,
      }).returning();
      if (type === "principal") {
        await tx.update(goldLoan).set({ amtPaid: round2((loan.amtPaid ?? 0) + amt), updatedAt: new Date() }).where(eq(goldLoan.id, id));
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

// More money given on the same pledge. It is added to the loan and charged from the start of the
// month of the loan it is taken in.
export async function giveMoreOnGoldLoan(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  if (!isUuid(id)) return { error: "Gold loan not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const { loan } = await loanPosition(tx, id, date);
      if (loan.status !== "active") throw new UserError("This loan is no longer active.");

      const [payment] = await tx.insert(goldLoanPayment).values({
        loan: id, date, amt, type: "topup", mode, desc: text(formData, "desc") || null,
      }).returning();
      const total = round2((loan.amt ?? 0) + amt);
      await tx.update(goldLoan).set({ amt: total, updatedAt: new Date() }).where(eq(goldLoan.id, id));
      await recordCash(tx, {
        direction: "out", amt, location: locationFor(mode),
        sourceTable: "gold_loan_payment", sourceId: payment.id, desc: `More given on gold loan against ${loan.item}`, date,
      });
      await logAudit(tx, user.id, { tableName: "gold_loan_payment", recordId: payment.id, action: "insert", newValues: payment });
      await logAudit(tx, user.id, { tableName: "gold_loan", recordId: id, action: "update", oldValues: { amt: loan.amt }, newValues: { amt: total } });
    });
  } catch (error) {
    return fail(error, "Could not give more on the loan.");
  }

  revalidateLoans(id);
  return { success: "More money given on the loan." };
}

// Full clearance: all the principal still due, and the interest and penalty the customer pays.
// Interest let go is written as a discount. The penalty taken may be less or more than the rule
// gives: the difference is written as a penalty waiver or as extra penalty. None of these three moves cash.
export async function clearGoldLoan(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const interestTaken = round2(num(formData, "interest"));
  const penaltyTaken = formData.has("penalty") ? round2(num(formData, "penalty")) : 0;
  const mode = text(formData, "mode");
  if (!isUuid(id)) return { error: "Gold loan not found." };
  if (interestTaken < 0) return { error: "Interest taken cannot be below zero." };
  if (penaltyTaken < 0) return { error: "Penalty taken cannot be below zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const { loan, principalDue, interestDue, penaltyDue } = await loanPosition(tx, id, date);
      if (loan.status !== "active") throw new UserError("This loan is no longer active.");
      if (interestTaken > interestDue) throw new UserError(`That is more than the ${inr(interestDue)} of interest due.`);
      const discount = round2(interestDue - interestTaken);
      const waived = round2(Math.max(0, penaltyDue - penaltyTaken));
      const extra = round2(Math.max(0, penaltyTaken - penaltyDue));

      const rows = [
        { type: "principal", amt: principalDue, mode },
        { type: "interest", amt: interestTaken, mode },
        { type: "discount", amt: discount, mode: null },
        { type: "penalty_extra", amt: extra, mode: null },
        { type: "penalty", amt: penaltyTaken, mode },
        { type: "penalty_waiver", amt: waived, mode: null },
      ].filter((row) => row.amt > 0);
      for (const row of rows) {
        const [payment] = await tx.insert(goldLoanPayment).values({ loan: id, date, ...row, desc: text(formData, "desc") || null }).returning();
        if (row.mode) {
          await recordCash(tx, {
            direction: "in", amt: row.amt, location: locationFor(mode),
            sourceTable: "gold_loan_payment", sourceId: payment.id, desc: `Gold loan ${row.type} received`, date,
          });
        }
        await logAudit(tx, user.id, { tableName: "gold_loan_payment", recordId: payment.id, action: "insert", newValues: payment });
      }
      await tx.update(goldLoan).set({ amtPaid: loan.amt, status: "closed", updatedAt: new Date() }).where(eq(goldLoan.id, id));
      await logAudit(tx, user.id, {
        tableName: "gold_loan", recordId: id, action: "update",
        oldValues: { status: "active", amtPaid: loan.amtPaid }, newValues: { status: "closed", amtPaid: loan.amt, interestDue, interestTaken, discount, penaltyDue, penaltyTaken, penaltyWaived: waived, penaltyExtra: extra },
      });
    });
  } catch (error) {
    return fail(error, "Could not clear the loan.");
  }

  revalidateLoans(id);
  return { success: "Loan cleared. Return the pledge." };
}

// A defaulted pledge becomes the shop's old metal, valued at principal plus unpaid interest and penalty.
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
      const { loan, principalDue, interestDue, penaltyDue } = await loanPosition(tx, id, date);
      const [updated] = await tx.update(goldLoan)
        .set({ status: "defaulted", updatedAt: new Date() })
        .where(and(eq(goldLoan.id, id), eq(goldLoan.status, "active")))
        .returning();
      if (!updated) throw new UserError("This loan is no longer active.");

      const value = round2(principalDue + interestDue + penaltyDue);
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
