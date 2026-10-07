import { round2, round3 } from "@/lib/pricing";
import type { Entry, EntryInput, Head, PayMode } from "./types";

// The popup form's fields as typed, and the checks on them. The same checks run in the browser
// and again on the server.

export type EntryValues = {
  day: string;
  headId: string;
  party: string;
  weight: string;
  purity: string;
  rate: string;
  amt: string;
  mode: PayMode;
  note: string;
  extra: Record<string, string>;
};

export type ErrorKey = "head" | "day" | "amt" | "party" | "required" | "number";
export type EntryErrors = Record<string, ErrorKey>;

export const PAY_MODES = ["cash", "upi", "cheque", "bank"] as const satisfies PayMode[];

// A line can be typed under any head but the two the book fills in itself: the opening cash, and
// the bank account, whose lines come from deposits, withdrawals and bank payments.
export const takesLines = (head: Head) => head.role === null;

export const blankValues = (day: string, headId = "", mode: PayMode = "cash"): EntryValues =>
  ({ day, headId, party: "", weight: "", purity: "", rate: "", amt: "", mode, note: "", extra: {} });

const shown = (n: number | null) => (n === null ? "" : String(n));

export const valuesOf = (entry: Entry): EntryValues => ({
  day: entry.day,
  headId: entry.headId,
  party: entry.party ?? "",
  weight: shown(entry.weight),
  purity: shown(entry.purity),
  rate: shown(entry.rate),
  amt: String(entry.amt),
  mode: entry.mode,
  note: entry.note ?? "",
  extra: { ...entry.extra },
});

// weight × rate, or nothing until both are filled in.
export function autoAmount(weight: string, rate: string) {
  const amt = round2(Number(weight) * Number(rate));
  return weight.trim() && rate.trim() && Number.isFinite(amt) && amt > 0 ? String(amt) : "";
}

// An optional number: empty is fine, anything else must be a number from zero up.
const optional = (text: string) => {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export function parseEntry(
  values: EntryValues,
  heads: Head[],
  today: string,
): { input: EntryInput; errors: null } | { input: null; errors: EntryErrors } {
  const errors: EntryErrors = {};
  const head = heads.find((h) => h.id === values.headId && takesLines(h));
  if (!head) errors.headId = "head";
  const mode = PAY_MODES.find((m) => m === values.mode) ?? "cash";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.day) || values.day > today) errors.day = "day";

  const amt = round2(Number(values.amt));
  if (!values.amt.trim() || !Number.isFinite(amt) || amt <= 0) errors.amt = "amt";

  const party = values.party.trim();
  if (head?.partyRequired && !party) errors.party = "party";

  const weight = optional(values.weight);
  const purity = head?.showRate ? optional(values.purity) : null;
  const rate = head?.showRate ? optional(values.rate) : null;
  if (Number.isNaN(weight)) errors.weight = "number";
  if (Number.isNaN(purity)) errors.purity = "number";
  if (Number.isNaN(rate)) errors.rate = "number";

  // Only the fields this head asks for are kept.
  const extra: Record<string, string> = {};
  for (const field of head?.extraFields ?? []) {
    const text = (values.extra[field.key] ?? "").trim();
    if (!text) {
      if (field.required) errors[`extra.${field.key}`] = "required";
    } else if (field.type === "number" && !Number.isFinite(Number(text))) {
      errors[`extra.${field.key}`] = "number";
    } else {
      extra[field.key] = text;
    }
  }

  if (!head || Object.keys(errors).length > 0) return { input: null, errors };
  return {
    errors: null,
    input: {
      day: values.day,
      headId: head.id,
      amt,
      party: party || null,
      weight: weight ? round3(weight) : null,
      purity: purity ? round3(purity) : null,
      rate: rate ? round2(rate) : null,
      note: values.note.trim() || null,
      mode,
      extra,
    },
  };
}
