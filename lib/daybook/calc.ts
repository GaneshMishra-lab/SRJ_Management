import { round2 } from "@/lib/pricing";
import type { Entry, Head, Line } from "./types";

// Turns the day's entries into the lines written under each head. Money in on a जमा head, or out on
// a नावे head, adds to the head; the other way round it is a minus line.
export function project(entries: Entry[], heads: Head[]): Line[] {
  const byId = new Map(heads.map((head) => [head.id, head]));
  const bank = {
    credit: heads.find((head) => head.role === "bank" && head.side === "credit"),
    debit: heads.find((head) => head.role === "bank" && head.side === "debit"),
  };

  const lines: Line[] = [];
  for (const entry of entries) {
    const head = byId.get(entry.headId);
    if (!head) continue;
    const adds = (head.side === "credit") === (entry.flow === "in");
    lines.push({ id: entry.id, headId: head.id, amt: adds ? entry.amt : -entry.amt, contra: false, entry, fields: head.extraFields });

    // Money through the bank is written again on the other side under the bank's head, so the
    // cash in the drawer is left as it was.
    const contra = entry.bank ? bank[entry.flow === "in" ? "debit" : "credit"] : undefined;
    if (contra) lines.push({ id: `${entry.id}:contra`, headId: contra.id, amt: entry.amt, contra: true, entry, fields: [] });
  }
  return lines;
}

// Adds up one day. The opening cash counts as the first जमा; शिल्लक is जमा less नावे.
export function tally(heads: Head[], lines: Line[], opening: number) {
  const linesByHead = new Map<string, Line[]>();
  for (const line of lines) linesByHead.set(line.headId, [...(linesByHead.get(line.headId) ?? []), line]);

  // A head with nothing written under it has no total: its line stays blank, as in the book.
  const totals = new Map<string, number | null>();
  let credit = 0;
  let debit = 0;
  for (const head of heads) {
    const written = linesByHead.get(head.id) ?? [];
    const sum = round2(written.reduce((total, line) => total + line.amt, head.role === "opening" ? opening : 0));
    totals.set(head.id, written.length > 0 || head.role === "opening" ? sum : null);
    if (head.side === "credit") credit += sum;
    else debit += sum;
  }

  return { linesByHead, totals, credit: round2(credit), debit: round2(debit), closing: round2(credit - debit) };
}

export type Tally = ReturnType<typeof tally>;
