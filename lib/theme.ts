export type Theme = "light" | "dark" | "auto";

// The theme cookie's value, or "auto" (follow the device) when it is missing or not one we know.
export const readTheme = (value: string | undefined): Theme => (value === "light" || value === "dark" ? value : "auto");
