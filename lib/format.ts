const IST = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const inr = (n: number | null | undefined) =>
  `₹ ${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const grams = (n: number | null | undefined) => `${(n ?? 0).toFixed(3)} g`;

// Timestamps are stored as UTC without a zone; read them back as UTC.
export function parseDbDate(value: string | Date) {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+05:30`); // a shop calendar day
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
}

export const dateTime = (value: string | Date | null | undefined) =>
  value ? parseDbDate(value).toLocaleString("en-IN", { timeZone: IST, dateStyle: "medium", timeStyle: "short" }) : "-";

export const dateOnly = (value: string | Date | null | undefined) =>
  value ? parseDbDate(value).toLocaleDateString("en-IN", { timeZone: IST, dateStyle: "medium" }) : "-";

// The shop's calendar day (YYYY-MM-DD), in Indian time.
export const istDate = (d = new Date()) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

// The time on the shop's clock (HH:MM:SS), in Indian time.
export const istTime = (d = new Date()) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(11, 19);

// UTC instants bounding one Indian calendar day: [start, end).
export function istDayRange(day: string) {
  const start = new Date(`${day}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}
