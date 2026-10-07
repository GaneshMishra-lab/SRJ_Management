"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { miscCategory, miscItem } from "@/db/schema/entities";
import { miscTrade, miscTradePayment } from "@/db/schema/ledger";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { parseDue } from "@/lib/due";
import { resolveEntity } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";

const UNITS = ["piece", "pair", "set", "gram"];

function revalidateMisc() {
  revalidatePath("/misc");
  revalidatePath("/ledgers");
  revalidatePath("/daybook");
  revalidatePath("/dashboard");
}

export async function addMiscCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const name = text(formData, "name");
  if (!name) return { error: "Enter a category name." };
  try {
    const [row] = await db.insert(miscCategory).values({ name }).returning();
    await logAudit(db, user.id, { tableName: "misc_category", recordId: row.id, action: "insert", newValues: row });
  } catch (error) {
    return fail(error, "Could not add the category.");
  }
  revalidatePath("/misc");
  return { success: "Category added." };
}

export async function addMiscItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const category = text(formData, "category");
  const name = text(formData, "name");
  const unit = text(formData, "unit");
  if (!isUuid(category)) return { error: "Choose a category (add one first if there are none)." };
  if (!name) return { error: "Enter an item name." };
  if (!UNITS.includes(unit)) return { error: "Choose a unit." };
  try {
    const [row] = await db.insert(miscItem).values({ category, name, unit, desc: text(formData, "desc") || null }).returning();
    await logAudit(db, user.id, { tableName: "misc_item", recordId: row.id, action: "insert", newValues: row });
  } catch (error) {
    return fail(error, "Could not add the item.");
  }
  revalidatePath("/misc");
  return { success: "Item added." };
}

export async function addMiscTrade(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const type = text(formData, "type");
  const item = text(formData, "item");
  const qty = Math.trunc(num(formData, "qty"));
  const unitPrice = round2(num(formData, "unitPrice"));
  const mode = text(formData, "mode");

  if (type !== "purchase" && type !== "sale") return { error: "Choose purchase or sale." };
  if (!isUuid(item)) return { error: "Choose an item (add one first if there are none)." };
  if (qty <= 0 || unitPrice <= 0) return { error: "Enter a whole quantity and a unit price." };

  const amt = round2(qty * unitPrice);
  // A purchase can be bought on the supplier's credit: "paid" is what was paid now, and left
  // empty it means the whole amount, as a sale always is.
  const paid = type === "purchase" && text(formData, "paid") !== "" ? round2(num(formData, "paid")) : amt;
  if (paid < 0 || paid > amt) return { error: "Amount paid now cannot be more than the total." };
  if (paid > 0 && !isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    const dueDate = paid < amt ? parseDue(text(formData, "dueDate"), text(formData, "creditDays"), date) : null;
    await db.transaction(async (tx) => {
      const [itemRow] = await tx.select().from(miscItem).where(eq(miscItem.id, item));
      if (!itemRow) throw new UserError("Item not found.");
      const party = await resolveEntity(tx, user.id, formData, type === "purchase" ? "supplier" : "customer");
      const [trade] = await tx.insert(miscTrade).values({
        date, type, entity: party, item, qty, unitPrice, amt, mode: paid > 0 ? mode : null, paidAmt: paid, dueDate,
      }).returning();
      if (paid > 0 && isCashMode(mode)) {
        await recordCash(tx, {
          direction: type === "purchase" ? "out" : "in", amt: paid, location: locationFor(mode),
          sourceTable: "misc_trade", sourceId: trade.id, date,
          desc: `${type === "purchase" ? "Bought" : "Sold"} ${qty} ${itemRow.unit ?? ""} ${itemRow.name ?? ""}`.replace(/\s+/g, " "),
        });
      }
      await logAudit(tx, user.id, { tableName: "misc_trade", recordId: trade.id, action: "insert", newValues: trade });
    });
  } catch (error) {
    return fail(error, "Could not record the trade.");
  }

  revalidateMisc();
  return { success: "Trade recorded." };
}

// Pay a supplier for a misc purchase that was bought on credit.
export async function payMiscTrade(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const amt = round2(num(formData, "amt"));
  const mode = text(formData, "mode");
  if (!isUuid(id)) return { error: "Choose the purchase being paid for." };
  if (amt <= 0) return { error: "Enter an amount above zero." };
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(formData);
    await db.transaction(async (tx) => {
      // Only succeeds while the payment fits in what is still due.
      const [updated] = await tx.update(miscTrade)
        .set({ paidAmt: sql`coalesce(${miscTrade.paidAmt}, 0) + ${amt}`, updatedAt: new Date() })
        .where(and(
          eq(miscTrade.id, id),
          eq(miscTrade.type, "purchase"),
          sql`coalesce(${miscTrade.paidAmt}, 0) + ${amt} <= coalesce(${miscTrade.amt}, 0)`,
        ))
        .returning();
      if (!updated) throw new UserError("That is more than what is due on this purchase.");

      const [payment] = await tx.insert(miscTradePayment).values({ trade: id, date, amt, mode }).returning();
      await recordCash(tx, {
        direction: "out", amt, location: locationFor(mode),
        sourceTable: "misc_trade_payment", sourceId: payment.id, desc: "Payment to supplier for a misc purchase", date,
      });
      await logAudit(tx, user.id, { tableName: "misc_trade_payment", recordId: payment.id, action: "insert", newValues: payment });
    });
  } catch (error) {
    return fail(error, "Could not record the payment.");
  }

  revalidateMisc();
  return { success: "Payment recorded." };
}

// The same, from a form where the purchase is one of its fields.
export async function payMiscTradeChosen(_prev: FormState, formData: FormData): Promise<FormState> {
  return payMiscTrade(text(formData, "trade"), _prev, formData);
}
