import { istDate } from "@/lib/format";

export type FormState ={ error?: string; success?: string } | undefined;

// An error whose message is safe and useful to show to staff.
export class UserError extends Error {}

export function fail(error: unknown, fallback: string): FormState {
  if (error instanceof UserError) return { error: error.message };
  console.error(fallback, error);
  return { error: fallback };
}

export const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export function num(formData: FormData, name: string) {
  const n = Number(formData.get(name));
  return Number.isFinite(n) ? n : 0;
}

// When an entry really happened, from a form's date field (YYYY-MM-DD on the shop calendar).
// Empty or today means now; an earlier day is stamped at noon so it sits inside that shop day.
export function entryDate(day: string | null | undefined) {
  const today = istDate();
  if (!day || day === today) return new Date().toISOString();
  const at = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00+05:30`) : null;
  if (!at || Number.isNaN(at.getTime()) || istDate(at) !== day || day > today) {
    throw new UserError("Choose today or an earlier date.");
  }
  return at.toISOString();
}

export const isUuid =(value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
