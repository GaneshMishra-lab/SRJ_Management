import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { itemPurchased, itemType, looseStockLedger } from "@/db/schema/sales";
import type { Executor } from "@/lib/ledger";

// The single place loose metal movements are written.
export async function recordLoose(
  executor: Executor,
  entry: {
    itemType: string;
    melting: number;
    direction: "in" | "out";
    weight: number;
    sourceTable: string;
    sourceId?: string;
    desc: string;
    date?: string; // when the metal really moved; now if left out
  },
) {
  const [row] = await executor.insert(looseStockLedger).values({
    ...entry,
    date: entry.date ?? new Date().toISOString(),
  }).returning();
  return row;
}

// The loose stock entry a purchased item made, for joining to item_purchased.
export const looseFromPurchase = and(
  eq(looseStockLedger.sourceTable, "item_purchased"),
  eq(looseStockLedger.sourceId, itemPurchased.id),
);

// The same entry, looked up for one purchased item.
export const looseOfPurchase = (itemId: string) =>
  and(eq(looseStockLedger.sourceTable, "item_purchased"), eq(looseStockLedger.sourceId, itemId));

const signedLoose = sql<number>`coalesce(sum(case when ${looseStockLedger.direction} = 'in' then ${looseStockLedger.weight} else -${looseStockLedger.weight} end), 0)`;

// Loose metal on hand per item type and melting, leaving out what has run down to nothing.
export async function looseBalances(executor: Pick<typeof db, "select"> = db, typeIds?: string[]) {
  return executor
    .select({
      itemTypeId: itemType.id,
      typeName: itemType.name,
      metal: itemType.metal,
      piecesPerGram: itemType.piecesPerGram,
      melting: sql<number>`coalesce(${looseStockLedger.melting}, 0)`.mapWith(Number),
      weight: signedLoose.mapWith(Number),
    })
    .from(looseStockLedger)
    .innerJoin(itemType, eq(looseStockLedger.itemType, itemType.id))
    .where(typeIds ? inArray(itemType.id, typeIds) : undefined)
    .groupBy(itemType.id, looseStockLedger.melting)
    .having(sql`${signedLoose} <> 0`)
    .orderBy(asc(itemType.name), asc(looseStockLedger.melting));
}

// About how many balls a weight comes to, for a type sold as so many to the gram.
export const loosePieces = (weight: number, piecesPerGram: number | null) =>
  piecesPerGram ? Math.round(weight * piecesPerGram) : null;
