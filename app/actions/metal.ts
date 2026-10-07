"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dailyMetalBalance } from "@/db/schema/ledger";
import { fineTrade, langdiLedger } from "@/db/schema/sales";
import { getCurrentUser, logAudit, requireOwner } from "@/lib/dal";
import { resolveEntity } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { istDate, istDayRange } from "@/lib/format";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { isBullionStandard, isMetal, langdiToFine, metalBalances, recordMetal } from "@/lib/metal";
import { round2, round3 } from "@/lib/pricing";

function revalidateMetal() {
  revalidatePath("/metal");
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
}

// Buy or sell fine bullion for money.
export async function tradeBullion(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const type = text(formData, "type");
  const metal = text(formData, "metal");
  const standard = text(formData, "standard");
  const weight = round3(num(formData, "weight"));
  const rate = round2(num(formData, "rate"));
  const mode = text(formData, "mode");

  if (type !== "purchase" && type !== "sale") return { error: "Choose buy or sell." };
  if (!isMetal(metal) || !isBullionStandard(standard)) return { error: "Choose the metal and its standard." };
  if (weight <= 0 || rate <= 0) return { error: "Enter the weight and the rate." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const party = await resolveEntity(tx, user.id, formData, "supplier");
      const amt = round2(weight * rate);
      const [trade] = await tx.insert(fineTrade).values({
        date, type, entity: party, metal, standard, weight, rate, amt, mode,
      }).returning();

      const buying = type === "purchase";
      await recordMetal(tx, {
        metal, standard, weight,
        direction: buying ? "in" : "out",
        sourceTable: "fine_trade",
        sourceId: trade.id,
        desc: buying ? "Bullion bought" : "Bullion sold",
        date,
      });
      await recordCash(tx, {
        direction: buying ? "out" : "in",
        amt,
        location: locationFor(mode),
        sourceTable: "fine_trade",
        sourceId: trade.id,
        desc: `${buying ? "Bought" : "Sold"} ${weight} g ${metal} ${standard} bullion`,
        date,
      });
      await logAudit(tx, user.id, { tableName: "fine_trade", recordId: trade.id, action: "insert", newValues: trade });
    });
  } catch (error) {
    return fail(error, "Could not record the bullion trade.");
  }

  revalidateMetal();
  return { success: "Bullion trade recorded." };
}

// Hand langdi to a dealer and receive fine bullion for it.
export async function tradeLangdi(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const metal = text(formData, "metal");
  const standard = text(formData, "standard");
  const weight = round3(num(formData, "weight"));
  const testedPurity = round3(num(formData, "testedPurity"));
  const deduction = round3(num(formData, "deduction"));

  if (!isMetal(metal) || !isBullionStandard(standard)) return { error: "Choose the metal and the standard received." };
  if (weight <= 0) return { error: "Enter the langdi weight." };
  if (testedPurity <= 0 || testedPurity > 100) return { error: "Tested purity must be between 0 and 100." };
  if (deduction < 0 || deduction >= weight) return { error: "Refining deduction must be less than the weight." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const party = await resolveEntity(tx, user.id, formData, "supplier");
      const fine = langdiToFine(weight, testedPurity, deduction, standard);

      const [trade] = await tx.insert(fineTrade).values({
        date, type: "purchase", entity: party, metal, standard, weight: fine, mode: "langdi",
      }).returning();
      await tx.insert(langdiLedger).values({
        date, metal, direction: "out", weight, testedPurity,
        refiningDeduction: deduction, fineWeight: fine, standard,
        sourceTable: "fine_trade", sourceId: trade.id, entity: party, desc: "Traded for bullion",
      });
      await recordMetal(tx, {
        metal, standard, direction: "in", weight: fine,
        sourceTable: "fine_trade", sourceId: trade.id, desc: `Bullion received for ${weight} g langdi`, date,
      });
      await logAudit(tx, user.id, { tableName: "fine_trade", recordId: trade.id, action: "insert", newValues: { ...trade, langdiWeight: weight, testedPurity, deduction } });
    });
  } catch (error) {
    return fail(error, "Could not record the langdi trade.");
  }

  revalidateMetal();
  return { success: "Langdi traded for bullion." };
}

export async function sellLangdi(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const metal = text(formData, "metal");
  const weight = round3(num(formData, "weight"));
  const testedPurity = round3(num(formData, "testedPurity"));
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");

  if (!isMetal(metal)) return { error: "Choose the metal." };
  if (weight <= 0 || amt <= 0) return { error: "Enter the weight and the amount received." };
  if (testedPurity < 0 || testedPurity > 100) return { error: "Tested purity must be between 0 and 100." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      const party = await resolveEntity(tx, user.id, formData, "supplier");
      const [entry] = await tx.insert(langdiLedger).values({
        date, metal, direction: "out", weight,
        testedPurity: testedPurity || null, sourceTable: "cash_sale", entity: party, amt, mode, desc: "Sold for cash",
      }).returning();
      await recordCash(tx, {
        direction: "in", amt, location: locationFor(mode),
        sourceTable: "langdi_ledger", sourceId: entry.id, desc: `Sold ${weight} g ${metal} langdi`, date,
      });
      await logAudit(tx, user.id, { tableName: "langdi_ledger", recordId: entry.id, action: "insert", newValues: entry });
    });
  } catch (error) {
    return fail(error, "Could not record the langdi sale.");
  }

  revalidateMetal();
  return { success: "Langdi sale recorded." };
}

// The real purity, entered by staff once a melt has been tested.
export async function setTestedPurity(entryId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const testedPurity = round3(num(formData, "testedPurity"));
  if (!isUuid(entryId)) return { error: "Entry not found." };
  if (testedPurity <= 0 || testedPurity > 100) return { error: "Tested purity must be between 0 and 100." };

  try {
    const [row] = await db.update(langdiLedger)
      .set({ testedPurity, updatedAt: new Date() })
      .where(eq(langdiLedger.id, entryId))
      .returning();
    if (!row) throw new UserError("Entry not found.");
    await logAudit(db, user.id, { tableName: "langdi_ledger", recordId: row.id, action: "update", newValues: { testedPurity } });
  } catch (error) {
    return fail(error, "Could not save the tested purity.");
  }

  revalidatePath("/metal");
  return { success: "Saved." };
}

// Opening stock and corrections for fine metal or langdi. Owner only.
export async function adjustMetal(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const kind = text(formData, "kind");
  const metal = text(formData, "metal");
  const direction = text(formData, "direction");
  const weight = round3(num(formData, "weight"));
  const desc = text(formData, "desc");

  if (!isMetal(metal)) return { error: "Choose the metal." };
  if (direction !== "in" && direction !== "out") return { error: "Choose add or remove." };
  if (weight <= 0) return { error: "Enter a weight above zero." };
  if (!desc) return { error: "Write the reason for this adjustment." };

  try {
    await db.transaction(async (tx) => {
      if (kind === "langdi") {
        const purity = round3(num(formData, "purity"));
        const [row] = await tx.insert(langdiLedger).values({
          date: new Date().toISOString(), metal, direction, weight,
          estPurity: purity > 0 && purity <= 100 ? purity : null,
          sourceTable: "adjustment", desc: `Adjustment: ${desc}`,
        }).returning();
        await logAudit(tx, owner.id, { tableName: "langdi_ledger", recordId: row.id, action: "insert", newValues: row });
      } else if (isBullionStandard(kind)) {
        const row = await recordMetal(tx, { metal, standard: kind, direction, weight, sourceTable: "adjustment", desc: `Adjustment: ${desc}` });
        await logAudit(tx, owner.id, { tableName: "metal_ledger", recordId: row.id, action: "insert", newValues: row });
      } else {
        throw new UserError("Choose what is being adjusted.");
      }
    });
  } catch (error) {
    return fail(error, "Could not record the adjustment.");
  }

  revalidateMetal();
  return { success: "Adjustment recorded." };
}

// Day-end tally for fine metal: weighed closing against the ledger. The ledger is not changed.
export async function closeMetalDay(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const day = text(formData, "date");
  const metal = text(formData, "metal");
  const standard = text(formData, "standard");
  const actualClosing = round3(num(formData, "actual"));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > istDate()) return { error: "Choose today or an earlier date." };
  if (!isMetal(metal) || !isBullionStandard(standard)) return { error: "Choose the metal and standard." };
  if (text(formData, "actual") === "" || actualClosing < 0) return { error: "Enter the weighed closing." };

  try {
    const { start, end } = istDayRange(day);
    const openingBalance = (await metalBalances(start))(metal, standard);
    const computedClosing = (await metalBalances(end))(metal, standard);
    const values = {
      openingBalance,
      computedClosing,
      actualClosing,
      discrepancy: round3(actualClosing - computedClosing),
      remarks: text(formData, "remarks") || null,
    };
    const [row] = await db.insert(dailyMetalBalance)
      .values({ date: day, metal, standard, ...values })
      .onConflictDoUpdate({
        target: [dailyMetalBalance.date, dailyMetalBalance.metal, dailyMetalBalance.standard],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    await logAudit(db, user.id, { tableName: "daily_metal_balance", recordId: row.id, action: "update", newValues: row });
  } catch (error) {
    return fail(error, "Could not save the closing.");
  }

  revalidatePath("/metal");
  return { success: "Closing saved." };
}
