import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { itemPurchased, itemType, looseStockLedger } from "@/db/schema/sales";
import type { Executor } from "@/lib/ledger";
import { round3 } from "@/lib/pricing";

// Loose stock (mani, phuli, nath) is kept in lots: one lot per item type, melting, wastage and
// making, since those decide what the metal cost. A type "counted in pieces" (phuli, nath) also
// keeps a piece count in each lot; mani is kept by weight alone.

// Scales never agree to the milligram: when the last piece of a lot is sold, a leftover up to this
// weight is written off by itself. A bigger one leaves the lot flagged until someone weighs it.
export const WRITE_OFF_LIMIT = 0.05;

export type LotTerms = { itemTypeId: string; melting: number; wastage: number; making: number };
export const lotKey = (lot: LotTerms) => `${lot.itemTypeId}|${lot.melting}|${lot.wastage}|${lot.making}`;

// The single place loose metal movements are written.
export async function recordLoose(
  executor: Executor,
  entry: {
    itemType: string;
    melting: number;
    wastage?: number;
    making?: number;
    direction: "in" | "out";
    weight: number;
    pieces?: number | null;
    sourceTable: string;
    sourceId?: string;
    desc: string;
    date?: string; // when the metal really moved; now if left out
  },
) {
  const [row] = await executor.insert(looseStockLedger).values({
    ...entry,
    wastage: entry.wastage ?? 0,
    making: entry.making ?? 0,
    pieces: entry.pieces ?? null,
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
const signedPieces = sql<number>`coalesce(sum(case when ${looseStockLedger.direction} = 'in' then coalesce(${looseStockLedger.pieces}, 0) else -coalesce(${looseStockLedger.pieces}, 0) end), 0)`;

// Loose stock on hand per lot, leaving out lots that have run down to nothing.
export async function looseBalances(executor: Pick<typeof db, "select"> = db, typeIds?: string[]) {
  const rows = await executor
    .select({
      itemTypeId: itemType.id,
      typeName: itemType.name,
      metal: itemType.metal,
      piecesPerGram: itemType.piecesPerGram,
      counted: itemType.counted,
      melting: sql<number>`coalesce(${looseStockLedger.melting}, 0)`.mapWith(Number),
      wastage: sql<number>`${looseStockLedger.wastage}`.mapWith(Number),
      making: sql<number>`${looseStockLedger.making}`.mapWith(Number),
      weight: signedLoose.mapWith(Number),
      pieces: signedPieces.mapWith(Number),
    })
    .from(looseStockLedger)
    .innerJoin(itemType, eq(looseStockLedger.itemType, itemType.id))
    .where(typeIds ? inArray(itemType.id, typeIds) : undefined)
    .groupBy(itemType.id, looseStockLedger.melting, looseStockLedger.wastage, looseStockLedger.making)
    .having(sql`${signedLoose} <> 0 or ${signedPieces} <> 0`)
    .orderBy(asc(itemType.name), asc(looseStockLedger.melting), asc(looseStockLedger.wastage), asc(looseStockLedger.making));
  return rows.map((row) => ({
    ...row,
    weight: round3(row.weight),
    // A counted lot with no pieces left but weight still on the book: the scale and the book disagree.
    leftover: row.counted && row.pieces <= 0 && Math.abs(round3(row.weight)) > 0,
  }));
}
export type LooseLot = Awaited<ReturnType<typeof looseBalances>>[number];

// How a lot is named on screen: "76% · wastage 4% · making ₹300/g".
export const lotTerms = (lot: { melting: number; wastage: number; making: number }) =>
  [`${lot.melting}%`, lot.wastage ? `wastage ${lot.wastage}%` : null, lot.making ? `making ₹${lot.making}/g` : null].filter(Boolean).join(" · ");

// When a counted lot's last piece has gone, whatever weight is left on the book is the scale's
// error. Up to WRITE_OFF_LIMIT it is written off as its own entry, so the lot closes at 0 pieces
// and 0 g; a bigger gap is left for someone to weigh. Returns the weight written off, if any.
// `sourceId` is the sale line that sold the last piece, so a corrected bill can find it again.
export async function closeEmptyLot(executor: Executor & Pick<typeof db, "select">, lot: LotTerms, date?: string, sourceId?: string) {
  const [found] = (await looseBalances(executor, [lot.itemTypeId])).filter((row) => lotKey(row) === lotKey(lot));
  if (!found?.leftover || Math.abs(found.weight) > WRITE_OFF_LIMIT) return null;
  await recordLoose(executor, {
    itemType: lot.itemTypeId, melting: lot.melting, wastage: lot.wastage, making: lot.making,
    direction: found.weight > 0 ? "out" : "in", weight: Math.abs(found.weight),
    sourceTable: "weighing_difference", sourceId, desc: "Weighing difference: last piece sold", date,
  });
  return found.weight;
}

// About how many balls a weight comes to, for a type sold as so many to the gram.
export const loosePieces = (weight: number, piecesPerGram: number | null) =>
  piecesPerGram ? Math.round(weight * piecesPerGram) : null;
