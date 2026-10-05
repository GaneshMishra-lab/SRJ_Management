"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { miscCategory, miscItem } from "@/db/schema/entities";
import { miscTrade } from "@/db/schema/ledger";
import { getCurrentUser, logAudit } from "@/lib/dal";
import { resolveEntity } from "@/lib/entities";
import { entryDate, fail, FormState, isUuid, num, text, UserError } from "@/lib/form";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { round2 } from "@/lib/pricing";

const UNITS = ["piece", "pair", "set", "gram"];

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
  if (!isCashMode(mode)) return { error: "Choose cash or online." };

  try {
    const date = entryDate(text(formData, "date"));
    await db.transaction(async (tx) => {
      const [itemRow] = await tx.select().from(miscItem).where(eq(miscItem.id, item));
      if (!itemRow) throw new UserError("Item not found.");
      const party = await resolveEntity(tx, user.id, formData, type === "purchase" ? "supplier" : "customer");
      const amt = round2(qty * unitPrice);
      const [trade] = await tx.insert(miscTrade).values({
        date, type, entity: party, item, qty, unitPrice, amt, mode,
      }).returning();
      await recordCash(tx, {
        direction: type === "purchase" ? "out" : "in", amt, location: locationFor(mode),
        sourceTable: "misc_trade", sourceId: trade.id, date,
        desc: `${type === "purchase" ? "Bought" : "Sold"} ${qty} ${itemRow.unit ?? ""} ${itemRow.name ?? ""}`.replace(/\s+/g, " "),
      });
      await logAudit(tx, user.id, { tableName: "misc_trade", recordId: trade.id, action: "insert", newValues: trade });
    });
  } catch (error) {
    return fail(error, "Could not record the trade.");
  }

  revalidatePath("/misc");
  revalidatePath("/ledgers");
  revalidatePath("/dashboard");
  return { success: "Trade recorded." };
}
