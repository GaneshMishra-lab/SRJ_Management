import { istDate, istTime } from "@/lib/format";

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

// When an entry really happened, from a form's <DateField> (or a day and a time passed directly):
// a day (YYYY-MM-DD) and a time (HH:MM) on the shop's calendar and clock.
// An empty day means today; an empty time means the time on the clock right now.
export function entryDate(source: FormData | string | null | undefined, time?: string | null) {
  const day = (source instanceof FormData ? text(source, "date") : source) || "";
  const clock = (source instanceof FormData ? text(source, "time") : time) || "";
  const now = new Date();
  const today = istDate(now);
  if (!clock && (!day || day === today)) return now.toISOString();

  if (clock && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw new UserError("Enter the time as hours and minutes.");
  const onDay = day || today;
  const at = /^\d{4}-\d{2}-\d{2}$/.test(onDay) ? new Date(`${onDay}T${clock ? `${clock}:00` : istTime(now)}+05:30`) : null;
  if (!at || Number.isNaN(at.getTime()) || istDate(at) !== onDay || onDay > today) {
    throw new UserError("Choose today or an earlier date.");
  }
  if (at > now) throw new UserError("That time has not come yet. Leave the time empty to use the time now.");
  return at.toISOString();
}

export const isUuid =(value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
