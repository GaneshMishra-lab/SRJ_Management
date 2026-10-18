"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bc, bcPayment } from "@/db/schema/finance";
import { bcFigures, bcTotals, maturesOn } from "@/lib/bc";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { resolveEntity } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { dateOnly, inr, istDate } from "@/lib/format";
import { eraseCash, isCashMode, locationFor, mayCorrect, recordCash } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";

// A BC is started, paid into month by month, matured once its term has run (the shop decides then
// whether the bonus is given), and spent on sale bills. Instalments are money in under the day
// book's BC head; spending it on a bill moves no cash.

function revalidateBc(id?: string) {
  revalidatePath("/bc");
  if (id) revalidatePath(`/bc/${id}`);
  revalidatePath("/sales/new");
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The instalment itself and the cash it brought in.
async function takeInstalment(tx: Tx, userId: number, bcId: string, amt: number, mode: "cash" | "online", date: string) {
  const [payment] = await tx.insert(bcPayment).values({ bc: bcId, date, amt, mode }).returning();
  await recordCash(tx, { direction: "in", amt, location: locationFor(mode), sourceTable: "bc_payment", sourceId: payment.id, desc: "BC instalment", date });
  await logAudit(tx, userId, { tableName: "bc_payment", recordId: payment.id, action: "insert", newValues: payment });
}

export async function createBc(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const instalment = round2(num(formData, "instalment"));
  const months = num(formData, "months") || 12;
  const multiplier = num(formData, "multiplier") || 13.5;
  const paid = round2(num(formData, "paid"));
  const mode = text(formData, "mode");
  const today = istDate();
  const startDate = text(formData, "date") || today;

  if (instalment <= 0) return { error: "Enter the monthly instalment." };
  if (!Number.isInteger(months) || months < 1 || months > 60) return { error: "Months must be a whole number from 1 to 60." };
  if (multiplier < months) return { error: `The BC's worth (${multiplier} instalments) cannot be less than what is paid in (${months}).` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate > today) return { error: "Choose today or an earlier day as the start." };
  if (paid < 0 || paid > instalment * months) return { error: "The amount paid now is more than the whole BC." };
  if (paid > 0 && !isCashMode(mode)) return { error: "Choose cash or online." };

  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const customer = await resolveEntity(tx, user.id, formData, "customer");
      const [row] = await tx.insert(bc).values({
        customer, cardNo: text(formData, "cardNo") || null, startDate, instalment, months, multiplier, note: text(formData, "note") || null,
      }).returning();
      await logAudit(tx, user.id, { tableName: "bc", recordId: row.id, action: "insert", newValues: row });
      // The first instalment is taken on the start day, at the time now when that is today.
      if (paid > 0 && isCashMode(mode)) await takeInstalment(tx, user.id, row.id, paid, mode, entryDate(startDate));
      return row.id;
    });
  } catch (error) {
    return fail(error, "Could not start the BC.");
  }

  revalidateBc(id);
  redirect(`/bc/${id}`);
}

export async function addBcPayment(bcId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  if (!isUuid(bcId)) return { error: "BC not found." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(bc).where(eq(bc.id, bcId)).for("update");
      if (!row) throw new UserError("BC not found.");
      if (row.maturedAt) throw new UserError("This BC is already matured; it takes no more instalments.");
      if (istDate(new Date(date)) < row.startDate) throw new UserError(`This BC starts on ${dateOnly(row.startDate)}.`);
      const { paid } = await bcTotals(tx, bcId);
      const left = round2(row.instalment * row.months - paid);
      if (amt > left) throw new UserError(left > 0 ? `Only ${inr(left)} is left to pay on this BC.` : "This BC is already paid in full.");
      await takeInstalment(tx, user.id, bcId, amt, mode, date);
    });
  } catch (error) {
    return fail(error, "Could not record the instalment.");
  }

  revalidateBc(bcId);
  return { success: "Instalment recorded." };
}

// An instalment entered by mistake. Today's are anyone's to remove; an earlier day's are the
// owner's, as for every other entry in the cash book.
export async function deleteBcPayment(paymentId: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(paymentId)) return { error: "Instalment not found." };

  let bcId: string;
  try {
    bcId = await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(bcPayment).where(eq(bcPayment.id, paymentId));
      if (!payment) throw new UserError("Instalment not found.");
      const [row] = await tx.select().from(bc).where(eq(bc.id, payment.bc)).for("update");
      if (row.maturedAt) throw new UserError("The BC is matured. Undo the maturity first.");
      if (!mayCorrect(user.role, payment.date)) throw new UserError("Only the owner can remove an instalment of an earlier day.");
      await eraseCash(tx, "bc_payment", paymentId);
      await tx.delete(bcPayment).where(eq(bcPayment.id, paymentId));
      await logAudit(tx, user.id, { tableName: "bc_payment", recordId: paymentId, action: "delete", oldValues: payment });
      return row.id;
    });
  } catch (error) {
    return fail(error, "Could not remove the instalment.");
  }

  revalidateBc(bcId);
  return { success: "Instalment removed." };
}

// Fixes what the BC is worth once its term has run: what was paid, and the bonus if the shop
// gives it. Whether a customer who missed instalments still gets the bonus is for staff to say.
export async function matureBc(bcId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const giveBonus = formData.get("bonus") === "on";
  if (!isUuid(bcId)) return { error: "BC not found." };

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(bc).where(eq(bc.id, bcId)).for("update");
      if (!row) throw new UserError("BC not found.");
      if (row.maturedAt) throw new UserError("This BC is already matured.");
      if (istDate() < maturesOn(row)) throw new UserError(`This BC can be used from ${dateOnly(maturesOn(row))}.`);
      const { paid } = await bcTotals(tx, bcId);
      if (paid <= 0) throw new UserError("Nothing has been paid into this BC.");

      const figures = bcFigures(row, paid, 0);
      const bonus = giveBonus ? figures.fullBonus : 0;
      const value = round2(paid + bonus);
      const maturedAt = new Date().toISOString();
      await tx.update(bc).set({ maturedAt, bonus, value, updatedAt: new Date() }).where(eq(bc.id, bcId));
      await logAudit(tx, user.id, {
        tableName: "bc", recordId: bcId, action: "update",
        oldValues: { maturedAt: null }, newValues: { maturedAt, paid, bonus, value, unpaid: figures.left, monthsDue: figures.monthsDue },
      });
    });
  } catch (error) {
    return fail(error, "Could not mature the BC.");
  }

  revalidateBc(bcId);
  return { success: "Matured. The customer can now buy against it." };
}

// Takes back a maturity made by mistake, while no bill has used the BC.
export async function undoBcMaturity(bcId: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isUuid(bcId)) return { error: "BC not found." };

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(bc).where(eq(bc.id, bcId)).for("update");
      if (!row?.maturedAt) throw new UserError("This BC is not matured.");
      if (!mayCorrect(user.role, row.maturedAt)) throw new UserError("Only the owner can undo a maturity of an earlier day.");
      const { spent } = await bcTotals(tx, bcId);
      if (spent > 0) throw new UserError("A sale bill has already used this BC. Cancel that bill first.");
      await tx.update(bc).set({ maturedAt: null, bonus: null, value: null, updatedAt: new Date() }).where(eq(bc.id, bcId));
      await logAudit(tx, user.id, {
        tableName: "bc", recordId: bcId, action: "update",
        oldValues: { maturedAt: row.maturedAt, bonus: row.bonus, value: row.value }, newValues: { maturedAt: null },
      });
    });
  } catch (error) {
    return fail(error, "Could not undo the maturity.");
  }

  revalidateBc(bcId);
  return { success: "Maturity undone." };
}
