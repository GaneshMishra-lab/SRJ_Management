export const inputClass =
  "w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none";
export const labelClass = "text-sm font-medium text-zinc-300";
export const cardClass = "rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 sm:p-6 backdrop-blur-sm";
export const tableWrapClass = "rounded-2xl border border-zinc-800 bg-zinc-950/50 backdrop-blur-sm overflow-hidden";
export const theadClass = "border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500";

export const stockStatus: Record<string, { label: string; className: string }> = {
  stock: { label: "In Stock", className: "bg-emerald-500/10 text-emerald-500" },
  on_approval: { label: "On Approval", className: "bg-blue-500/10 text-blue-400" },
  sold: { label: "Sold", className: "bg-purple-500/10 text-purple-400" },
  returned_to_supplier: { label: "Returned to Supplier", className: "bg-zinc-500/10 text-zinc-400" },
  melted: { label: "Melted", className: "bg-amber-500/10 text-amber-500" },
};
