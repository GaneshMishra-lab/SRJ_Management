import "server-only";
import { and, desc, eq, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashLedger, dailyRate } from "@/db/schema/ledger";
import { istDate, parseDbDate } from "@/lib/format";

export type CashMode = "cash" | "online";
export type CashLocation = "vault" | "account";

export type Executor = Pick<typeof db, "insert">;

export const isCashMode = (mode: string): mode is CashMode => mode === "cash" || mode === "online";
export const locationFor = (mode: CashMode): CashLocation => (mode === "cash" ? "vault" : "account");

// The single place cash movements are written. Every entry points at the row that caused it.
export async function recordCash(
  executor: Executor,
  entry: {
    direction: "in" | "out";
    amt: number;
    location: CashLocation;
    sourceTable: string;
    sourceId?: string;
    desc: string;
    date?: string; // when the money really moved; now if left out
  },
) {
  const [row] = await executor.insert(cashLedger).values({
    ...entry,
    date: entry.date ?? new Date().toISOString(),
  }).returning();
  return row;
}

type Corrector = Pick<typeof db, "update" | "delete">;
const causedBy = (sourceTable: string, sourceId: string) => and(eq(cashLedger.sourceTable, sourceTable), eq(cashLedger.sourceId, sourceId));

// The ledger entries a record caused: one, or the two legs of a bank transfer.
export const cashCausedBy = (executor: Pick<typeof db, "select">, sourceTable: string, sourceId: string) =>
  executor.select().from(cashLedger).where(causedBy(sourceTable, sourceId));

// For the few records that are corrected in place rather than reversed (a line typed into the
// day book, an expense, a bank transfer): the ledger entries they caused are rewritten, or
// removed, along with them. Only what is given is rewritten.
export async function rewriteCash(
  executor: Corrector,
  sourceTable: string,
  sourceId: string,
  entry: Partial<{ direction: "in" | "out"; amt: number; location: CashLocation; desc: string; date: string }>,
) {
  await executor.update(cashLedger).set({ ...entry, updatedAt: new Date() }).where(causedBy(sourceTable, sourceId));
}

export async function eraseCash(executor: Corrector, sourceTable: string, sourceId: string) {
  return executor.delete(cashLedger).where(causedBy(sourceTable, sourceId)).returning();
}

// Whether a user may correct or remove an entry, given when it happened (and when it is being
// moved to). Today's entries are anyone's to put right. An earlier day is the owner's alone:
// every later day's opening cash follows from it.
export function mayCorrect(role: string, ...dates: (string | null)[]) {
  const today = istDate();
  return role === "owner" || dates.every((date) => !date || istDate(parseDbDate(date)) >= today);
}

const signedAmt = sql<number>`coalesce(sum(case when ${cashLedger.direction} = 'in' then ${cashLedger.amt} else -${cashLedger.amt} end), 0)`.mapWith(Number);

// Balance per location, optionally as it stood just before a given instant.
export async function cashBalances(before?: string) {
  const rows = await db
    .select({ location: cashLedger.location, balance: signedAmt })
    .from(cashLedger)
    .where(before ? lt(cashLedger.date, before) : undefined)
    .groupBy(cashLedger.location);

  const balances: Record<CashLocation, number> = { vault: 0, account: 0 };
  for (const row of rows) {
    if (row.location === "vault" || row.location === "account") balances[row.location] = row.balance;
  }
  return balances;
}

export type CurrentRate = { rate: number; date: string; isToday: boolean } | null;

// Fine rate per metal as of a shop day (today unless given). Until that day's is entered, the most
// recent earlier one applies; isToday says whether the rate is that day's own.
export async function getCurrentRates(day = istDate()) {
  const rows = await db
    .select()
    .from(dailyRate)
    .where(lte(dailyRate.date, day))
    .orderBy(desc(dailyRate.date));

  const rates: { Gold: CurrentRate; Silver: CurrentRate } = { Gold: null, Silver: null };
  for (const row of rows) {
    if ((row.metal === "Gold" || row.metal === "Silver") && !rates[row.metal]) {
      rates[row.metal] = { rate: row.rate, date: row.date, isToday: row.date === day };
    }
  }
  return rates;
}
