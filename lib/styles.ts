// Shared class strings. Colours are theme tokens from globals.css, so they follow light and dark.

export const inputClass =
  "h-10 w-full rounded-ctl border border-line-strong bg-field px-3 text-[15px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-4 hover:border-fg-4 focus:border-focus focus:ring-3 focus:ring-focus/20 disabled:opacity-60";
export const selectClass = `${inputClass} select-field`;
export const labelClass = "block text-[13px] font-medium text-fg-2";
export const hintClass = "text-[13px] leading-relaxed text-fg-3";

export const cardClass = "rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6";
export const tableWrapClass = "overflow-hidden rounded-2xl border border-line bg-card shadow-card";
export const thClass = "border-b border-line px-5 py-2.5 text-left text-[13px] font-medium whitespace-nowrap text-fg-3";
export const tdClass = "px-5 py-3 whitespace-nowrap";
export const rowClass = "border-b border-line transition-colors last:border-0 hover:bg-fg/3";

// Links inside text: ink with a quiet underline, as on a printed page.
export const linkClass = "font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg";

const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-ctl font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";
const buttonVariants = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  accent: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-line-strong bg-card text-fg hover:bg-fg/5",
  ghost: "text-fg-2 hover:bg-fg/5 hover:text-fg",
  danger: "bg-bad text-white hover:opacity-90",
};
const buttonSizes = { md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-[13px]" };

// Ink for the main action, bordered for the rest, clay only where the brand should show.
export const btn = (variant: keyof typeof buttonVariants = "primary", size: keyof typeof buttonSizes = "md") =>
  `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]}`;

export const iconButtonClass = "grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-2 transition-colors hover:bg-fg/5 hover:text-fg";

export const stockStatus: Record<string, { label: string; tone: "ok" | "info" | "neutral" | "warn" }> = {
  stock: { label: "In stock", tone: "ok" },
  on_approval: { label: "On approval", tone: "info" },
  sold: { label: "Sold", tone: "neutral" },
  returned_to_supplier: { label: "Returned to supplier", tone: "neutral" },
  melted: { label: "Melted", tone: "warn" },
};
