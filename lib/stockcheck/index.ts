import { labelled } from "./labelled";
import type { CheckSource } from "./types";

export type { BookRow, CheckPiece, CheckSource } from "./types";

// Every kind of stock the register can check. Loose metal and miscellaneous items go here later.
export const checkSources: Record<string, CheckSource> = { labelled };

// Kinds shown on the page but not yet checkable.
export const laterKinds = [
  { kind: "loose", label: "Loose" },
  { kind: "misc", label: "Misc" },
];

export const checkMetals = ["Gold", "Silver"] as const;
