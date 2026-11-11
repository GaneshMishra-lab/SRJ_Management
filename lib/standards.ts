// Fine metal standards a bill or bullion can be expressed in.
export const STANDARDS = ["995", "999", "100"] as const;
export type Standard = (typeof STANDARDS)[number];

export const STANDARD_PURITY: Record<Standard, number> = {
  "995": 99.5,
  "999": 99.9,
  "100": 100,
};

// Same metal expressed in another standard: grams × from ÷ to.
export function convertStandard(weight: number, from: Standard, to: Standard) {
  return (weight * STANDARD_PURITY[from]) / STANDARD_PURITY[to];
}

// The bullion standard a loose lot's melting stands for, if it is fine metal: 99.9 → 999, 99.5 → 995.
// Anything else (a 76% phuli lot, say) is not bullion.
export const fineStandardOf = (melting: number): "995" | "999" | null =>
  melting === 99.9 ? "999" : melting === 99.5 ? "995" : null;
