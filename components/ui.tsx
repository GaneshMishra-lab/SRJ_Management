import Link from "next/link";
import { useId } from "react";
import { istDate } from "@/lib/format";
import { cardClass, inputClass, labelClass } from "@/lib/styles";

type Option = string | { value: string; label: string };

export function PageHeader({ title, subtitle, back }: { title: React.ReactNode; subtitle?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div>
      {back && <Link href={back.href} className="text-sm text-zinc-500 hover:text-zinc-300">← {back.label}</Link>}
      <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 ${back ? "mt-2" : ""}`}>{title}</h1>
      {subtitle && <p className="text-zinc-400 mt-1">{subtitle}</p>}
    </div>
  );
}

export function Card({ title, hint, children, className = "" }: { title?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${cardClass} ${className}`}>
      {title && <h2 className={`text-lg font-semibold text-zinc-100 ${hint ? "mb-1" : "mb-4"}`}>{title}</h2>}
      {hint && <p className="text-sm text-zinc-500 mb-4">{hint}</p>}
      {children}
    </div>
  );
}

export function Stats({ items }: { items: { name: string; value: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {items.map((stat) => (
        <div key={stat.name} className={cardClass}>
          <p className="text-sm text-zinc-400">{stat.name}</p>
          <p className="mt-1 text-lg sm:text-2xl font-semibold text-zinc-100 break-words">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input id={id} className={inputClass} {...props} />
    </div>
  );
}

// The day an entry really happened, for entries written up later. Read on the server with entryDate().
export const DateField = ({ label = "Date (today if left empty)" }: { label?: string }) =>
  <Field label={label} name="date" type="date" max={istDate()} />;

export const Rupees =(props: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) =>
  <Field type="number" step="0.01" min="0.01" {...props} />;

export const Grams = (props: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) =>
  <Field type="number" step="0.001" min="0.001" {...props} />;

export const Percent = (props: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) =>
  <Field type="number" step="0.001" min="0" max="100" {...props} />;

export function SelectField({ label, options, ...props }: { label: string; options: Option[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} className={inputClass} {...props}>
        {options.map((option) => {
          const { value, label: text } = typeof option === "string" ? { value: option, label: option } : option;
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
    </div>
  );
}

export const ModeField = ({ label }: { label: string }) => (
  <SelectField label={label} name="mode" options={[{ value: "cash", label: "Cash (Vault)" }, { value: "online", label: "Online (Bank)" }]} />
);

// Pick an existing person or type a new one. Read on the server with resolveEntity().
export function EntityFields({
  label,
  entities,
  newLabel = "Or a new customer",
}: {
  label: string;
  entities: { id: string; name: string | null; type: string | null }[];
  newLabel?: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SelectField
        label={label}
        name="entity"
        defaultValue=""
        options={[{ value: "", label: "Select..." }, ...entities.map((e) => ({ value: e.id, label: `${e.name ?? "Unnamed"} (${e.type})` }))]}
      />
      <div className="space-y-2">
        <Field label={newLabel} name="newName" type="text" placeholder="Name" />
        <input name="newContact" type="tel" placeholder="Contact number (optional)" aria-label="New contact number" className={inputClass} />
      </div>
    </div>
  );
}

export function StatusBadge({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "emerald" | "zinc" | "blue" | "red" }) {
  const tones = {
    amber: "bg-amber-500/10 text-amber-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    zinc: "bg-zinc-500/10 text-zinc-400",
    blue: "bg-blue-500/10 text-blue-400",
    red: "bg-red-500/10 text-red-400",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium capitalize ${tones[tone]}`}>{children}</span>;
}

// A simple table: header labels and rows of cells. Columns listed in `right` are right-aligned.
export function DataTable({ head, rows, empty, right = [] }: { head: string[]; rows: React.ReactNode[][]; empty: string; right?: number[] }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 backdrop-blur-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
            <tr>
              {head.map((h, i) => (
                <th key={i} className={`px-4 py-3 sm:px-6 sm:py-4 font-medium ${right.includes(i) ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rows.length === 0 ? (
              <tr><td colSpan={head.length} className="px-4 py-10 sm:px-6 text-center text-zinc-500">{empty}</td></tr>
            ) : (
              rows.map((row, r) => (
                <tr key={r} className="hover:bg-zinc-800/20 transition-colors">
                  {row.map((cell, i) => (
                    <td key={i} className={`px-4 py-3 sm:px-6 sm:py-4 ${right.includes(i) ? "text-right" : ""}`}>{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const linkClass = "text-amber-500 hover:text-amber-400";
