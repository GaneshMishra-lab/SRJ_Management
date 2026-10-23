export type Theme = "light" | "dark" | "auto";

// The theme cookie's value, or "auto" (follow the device) when it is missing or not one we know.
export const readTheme = (value: string | undefined): Theme => (value === "light" || value === "dark" ? value : "auto");

// Customer-facing pages keep their own choice, apart from the staff app's: light unless the visitor
// picked dark, whatever the device is set to.
export type SiteTheme = "light" | "dark";
export const SITE_THEME_COOKIE = "site-theme";
export const readSiteTheme = (value: string | undefined): SiteTheme => (value === "dark" ? "dark" : "light");
