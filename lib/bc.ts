import "server-only";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { bc, bcPayment } from "@/db/schema/finance";
import { itemSaleBill, itemSaleDetails } from "@/db/schema/sales";
import { istDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";

// The BC savings scheme. Nothing is stored that can be worked out: what was paid is the sum of the
// instalments, what is left is the value less what bills have used. A cancelled bill gives its share back.

type Reader = Pick<typeof db, "select">;
type Terms = Pick<typeof bc.$inferSelect, "startDate" | "instalment" | "months" | "multiplier" | "maturedAt" | "value">;

// The same day of the month, `months` later; the month's last day when it has no such day.
export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

// Instalment n (counting from 1) falls due n − 1 months after the start. The BC can be used once
// its whole term has run: a year after the start for a 12-month BC.
export const dueOn = (terms: Pick<Terms, "startDate">, n: number) => addMonths(terms.startDate, n - 1);
export const maturesOn = (terms: Pick<Terms, "startDate" | "months">) => addMonths(terms.startDate, terms.months);

export type BcStatus = "running" | "to_mature" | "ready" | "used";

export function bcFigures(terms: Terms, paid: number, spent: number, today = istDate()) {
  const { instalment, months } = terms;
  const term = round2(instalment * months);
  // The bonus of a BC paid in full: 1.5 instalments for 12 months at 13.5.
  const fullBonus = round2(Math.max(0, instalment * (terms.multiplier - months)));
  const fallen = Array.from({ length: months }, (_, i) => dueOn(terms, i + 1)).filter((day) => day <= today).length;
  const arrears = round2(Math.max(0, fallen * instalment - paid));
  const monthsPaid = Math.min(months, Math.floor(paid / instalment + 1e-9));
  const matured = Boolean(terms.maturedAt);
  const value = matured ? terms.value ?? 0 : null;
  const balance = matured ? round2((value ?? 0) - spent) : 0;
  const status: BcStatus = matured ? (balance > 0 ? "ready" : "used") : today >= maturesOn(terms) ? "to_mature" : "running";
  return {
    term,
    fullBonus,
    paid,
    spent,
    arrears,
    monthsDue: Math.ceil(arrears / instalment - 1e-9),
    monthsPaid,
    left: round2(Math.max(0, term - paid)), // still to pay before the term is complete
    nextDue: !matured && monthsPaid < months ? dueOn(terms, monthsPaid + 1) : null,
    maturesOn: maturesOn(terms),
    value,
    balance,
    status,
  };
}

const paidSum = sql<number>`coalesce(sum(${bcPayment.amt}), 0)`.mapWith(Number);
const spentSum = sql<number>`coalesce(sum(${itemSaleDetails.amtPaid}), 0)`.mapWith(Number);
const notCancelled = and(eq(itemSaleDetails.mode, "bc"), isNull(itemSaleBill.cancelledAt));

// What one BC has had paid in, and what bills still standing have used of it.
export async function bcTotals(reader: Reader, id: string) {
  const [[{ paid }], [{ spent }]] = await Promise.all([
    reader.select({ paid: paidSum }).from(bcPayment).where(eq(bcPayment.bc, id)),
    reader.select({ spent: spentSum }).from(itemSaleDetails).innerJoin(itemSaleBill, eq(itemSaleDetails.sale, itemSaleBill.id)).where(and(eq(itemSaleDetails.bc, id), notCancelled)),
  ]);
  return { paid: round2(paid), spent: round2(spent) };
}

// Every BC with its customer and figures, or one customer's.
export async function listBcs(customer?: string) {
  const [rows, paid, spent] = await Promise.all([
    db.select({ bc, name: entity.name, contact: entity.contact })
      .from(bc)
      .innerJoin(entity, eq(bc.customer, entity.id))
      .where(customer ? eq(bc.customer, customer) : undefined)
      .orderBy(asc(bc.startDate), asc(bc.createdAt)),
    db.select({ bc: bcPayment.bc, paid: paidSum }).from(bcPayment).groupBy(bcPayment.bc),
    db.select({ bc: itemSaleDetails.bc, spent: spentSum })
      .from(itemSaleDetails)
      .innerJoin(itemSaleBill, eq(itemSaleDetails.sale, itemSaleBill.id))
      .where(and(isNotNull(itemSaleDetails.bc), notCancelled))
      .groupBy(itemSaleDetails.bc),
  ]);
  const paidBy = new Map(paid.map((row) => [row.bc, round2(row.paid)]));
  const spentBy = new Map(spent.map((row) => [row.bc, round2(row.spent)]));
  const today = istDate();
  return rows.map((row) => ({
    ...row.bc,
    name: row.name,
    contact: row.contact,
    ...bcFigures(row.bc, paidBy.get(row.bc.id) ?? 0, spentBy.get(row.bc.id) ?? 0, today),
  }));
}

export type BcListed = Awaited<ReturnType<typeof listBcs>>[number];

export const bcName = (row: { cardNo: string | null; name?: string | null }) =>
  [row.name, row.cardNo ? `card ${row.cardNo}` : null].filter(Boolean).join(" · ") || "BC";
