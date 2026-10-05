import "server-only";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { metalLedger } from "@/db/schema/ledger";
import { langdiLedger } from "@/db/schema/sales";
import type { Executor } from "@/lib/ledger";
import { round3 } from "@/lib/pricing";
import { STANDARD_PURITY, Standard } from "@/lib/standards";

export const METALS = ["Gold", "Silver"] as const;
export const BULLION_STANDARDS = ["995", "999"] as const;

export const isMetal = (value: string): value is (typeof METALS)[number] => value === "Gold" || value === "Silver";
export const isStandard = (value: string): value is Standard => value in STANDARD_PURITY;
export const isBullionStandard = (value: string): value is "995" | "999" => value === "995" || value === "999";

// The single place fine metal movements are written.
export async function recordMetal(
  executor: Executor,
  entry: {
    metal: string;
    standard: string;
    direction: "in" | "out";
    weight: number;
    sourceTable: string;
    sourceId?: string;
    desc: string;
    date?: string; // when the metal really moved; now if left out
  },
) {
  const [row] = await executor.insert(metalLedger).values({
    ...entry,
    date: entry.date ?? new Date().toISOString(),
  }).returning();
  return row;
}

// Langdi is valued as fine: (weight - refining deduction) × tested purity ÷ the standard it is counted in.
export const langdiToFine = (weight: number, testedPurity: number, deduction: number, standard: Standard) =>
  round3(((weight - deduction) * testedPurity) / STANDARD_PURITY[standard]);

const signedMetal = sql<number>`coalesce(sum(case when ${metalLedger.direction} = 'in' then ${metalLedger.weight} else -${metalLedger.weight} end), 0)`.mapWith(Number);

// Fine metal in hand per metal and standard, optionally as it stood just before a given instant.
export async function metalBalances(before?: string) {
  const rows = await db
    .select({ metal: metalLedger.metal, standard: metalLedger.standard, balance: signedMetal })
    .from(metalLedger)
    .where(before ? lt(metalLedger.date, before) : undefined)
    .groupBy(metalLedger.metal, metalLedger.standard);

  const balances = new Map<string, number>();
  for (const row of rows) balances.set(`${row.metal}-${row.standard}`, row.balance);
  return (metal: string, standard: string) => balances.get(`${metal}-${standard}`) ?? 0;
}

// Langdi weight in hand per metal.
export async function langdiBalances() {
  const rows = await db
    .select({
      metal: langdiLedger.metal,
      balance: sql<number>`coalesce(sum(case when ${langdiLedger.direction} = 'in' then ${langdiLedger.weight} else -${langdiLedger.weight} end), 0)`.mapWith(Number),
    })
    .from(langdiLedger)
    .groupBy(langdiLedger.metal);

  const balances = new Map(rows.map((row) => [row.metal, row.balance]));
  return (metal: string) => balances.get(metal) ?? 0;
}
