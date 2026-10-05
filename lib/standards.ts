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
