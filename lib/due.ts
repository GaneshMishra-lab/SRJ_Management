import { istDate } from "@/lib/format";
import { UserError } from "@/lib/form";

// Suppliers give credit for a number of days that differs from bill to bill. What is kept is the
// day the credit runs out; these work it out and say how far away it is.

const DAY_MS = 24 * 60 * 60 * 1000;
const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// The day `days` after `day` (both YYYY-MM-DD).
export const dueDateFrom = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// The credit days a due date amounts to, counted from `day`; empty when either is not a day.
export const creditDaysOf = (day: string, dueDate: string) => (isDay(day) && isDay(dueDate) ? String(daysBetween(day, dueDate)) : "");

// The due date typed on a form: a date as it is, or a number of days counted from the entry's own
// day (`at`, the instant entryDate() gave). Neither typed means no due date was agreed.
export function parseDue(dueDate: string | undefined, creditDays: string | number | undefined, at: string) {
  const day = istDate(new Date(at));
  const typedDate = (dueDate ?? "").trim();
  if (typedDate) {
    if (!isDay(typedDate) || typedDate < day) throw new UserError("The due date cannot be before the day of the entry.");
    return typedDate;
  }
  const typedDays = String(creditDays ?? "").trim();
  if (!typedDays) return null;
  const days = Number(typedDays);
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new UserError("Enter the credit as a whole number of days.");
  return dueDateFrom(day, days);
}

export type DueStatus = { tone: "bad" | "warn" | "neutral"; label: string; days: number } | null;

// How a balance stands against its due date. Nothing is said once it is paid, or when no date was agreed.
export function dueStatus(dueDate: string | null | undefined, balance: number, today = istDate()): DueStatus {
  if (!dueDate || balance <= 0) return null;
  const days = daysBetween(today, dueDate);
  if (days < 0) return { tone: "bad", label: `Overdue ${-days} ${days === -1 ? "day" : "days"}`, days };
  if (days === 0) return { tone: "warn", label: "Due today", days };
  return { tone: days <= 7 ? "warn" : "neutral", label: `Due in ${days} ${days === 1 ? "day" : "days"}`, days };
}
