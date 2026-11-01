import type { db } from "@/db";

export type Executor = Pick<typeof db, "select" | "execute">;

// One row of the register as the book has it at the end of a day.
export type BookRow = {
  id: string; // what is counted: an item type for labelled stock
  name: string;
  expected: number; // in the book at the end of the day
  added: number | null; // since the check before; null when there was none
  removed: number | null;
  away: number; // in the book but not in the shop to be counted
};

// A piece the check can be traced down to, when a row's count does not match.
export type CheckPiece = { id: string; subjectId: string; label: number | null; weight: number | null; away: boolean };

// A kind of stock that can be checked against the book. The page, the action and the tables only
// know this shape, so loose metal and miscellaneous items can be added as sources of their own.
export type CheckSource = {
  kind: string;
  label: string;
  unit: string; // how a count reads: "pieces", "g"
  awayLabel: string; // what `away` means for this stock
  // `since` is the day of the check before (its end), or null for the first check.
  book(executor: Executor, metal: string, day: string, since: string | null): Promise<BookRow[]>;
  pieces?(executor: Executor, metal: string): Promise<CheckPiece[]>;
};
