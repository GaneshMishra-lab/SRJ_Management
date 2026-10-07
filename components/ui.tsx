import Link from "next/link";
import { isValidElement, useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RowLink } from "@/components/controls";
import { istDate } from "@/lib/format";
import { hintClass, iconButtonClass, inputClass, labelClass, rowClass, selectClass, tdClass, thClass } from "@/lib/styles";

// The app's building blocks. Nothing here uses state, so they work in server and client components alike;
// the interactive ones (segmented control, search field, clickable rows) live in controls.tsx.

type Option = string | { value: string; label: string };

// The toolbar at the top of every page: an optional back button, the title, and the page's controls
// on the right. On a wide screen it stays in place while the page scrolls underneath it.
export function PageHeader({
  title,
  subtitle,
  back,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <header className="relative z-20 flex min-h-18 flex-wrap items-center gap-x-4 gap-y-3 py-3 before:absolute before:inset-y-0 before:right-[-100vw] before:left-[-100vw] before:-z-10 before:border-b before:border-line before:bg-page/85 before:backdrop-blur-md lg:sticky lg:top-0">
      <div className="flex min-w-0 items-center gap-1.5">
        {back && (
          <Link href={back.href} aria-label={`Back to ${back.label}`} title={`Back to ${back.label}`} className={`-ml-2 ${iconButtonClass}`}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[1.625rem] leading-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-3">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

// A white panel. `flush` drops the padding, for tables and lists that run edge to edge.
export function Card({
  title,
  hint,
  action,
  flush = false,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const headed = Boolean(title || action);
  return (
    <section className={`rounded-2xl border border-line bg-card shadow-card ${flush ? "overflow-hidden" : ""} ${className}`}>
      {headed && (
        <header className={`flex items-start justify-between gap-4 px-5 pt-5 ${flush ? "pb-4" : ""}`}>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
            {hint && <p className={`mt-1 ${hintClass}`}>{hint}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? "" : `px-5 pb-5 ${headed ? "pt-4" : "pt-5"}`}>{children}</div>
    </section>
  );
}

const statColumns: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };
const statTones = { ok: "text-ok", accent: "text-accent", warn: "text-warn", bad: "text-bad" };

// Headline figures in one panel, divided by hairlines.
export function Stats({ items }: { items: { name: string; value: React.ReactNode; note?: React.ReactNode; tone?: keyof typeof statTones }[] }) {
  return (
    <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card ${statColumns[items.length] ?? "lg:grid-cols-4"}`}>
      {items.map((stat) => (
        <div key={stat.name} className="bg-card px-5 py-4 last:odd:col-span-2 lg:last:odd:col-span-1">
          <dt className="text-[13px] text-fg-3">{stat.name}</dt>
          <dd className={`mt-1 font-serif text-[1.625rem] leading-tight font-medium tabular-nums wrap-break-word ${stat.tone ? statTones[stat.tone] : "text-fg"}`}>
            {stat.value}
          </dd>
          {stat.note && <p className="mt-1 text-[13px] text-fg-3">{stat.note}</p>}
        </div>
      ))}
    </dl>
  );
}

// className goes on the wrapper, so a field can span grid columns.
export function Field({ label, hint, className = "", ...props }: { label: string; hint?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input id={id} className={inputClass} {...props} />
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

// The day and time an entry really happened, for entries written up later. Read on the server with entryDate().
// Kept narrow, so it does not stretch across a wide form. `time={false}` asks for the day alone.
export const DateField = ({
  label = "Date (today if left empty)",
  className = "max-w-md",
  time = true,
}: { label?: string; className?: string; time?: boolean }) => (
  <div className={`grid items-end gap-4 ${time ? "grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""} ${className}`}>
    <Field label={label} name="date" type="date" max={istDate()} />
    {time && <Field label="Time (now if left empty)" name="time" type="time" />}
  </div>
);

export const Rupees = (props: { label: string; name: string } & React.ComponentProps<typeof Field>) =>
  <Field type="number" step="0.01" min="0.01" {...props} />;

export const Grams = (props: { label: string; name: string } & React.ComponentProps<typeof Field>) =>
  <Field type="number" step="0.001" min="0.001" {...props} />;

export const Percent = (props: { label: string; name: string } & React.ComponentProps<typeof Field>) =>
  <Field type="number" step="0.001" min="0" max="100" {...props} />;

// Options come either as a list or as <option> children.
export function SelectField({
  label,
  options,
  hint,
  className = "",
  children,
  ...props
}: { label: string; options?: Option[]; hint?: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} className={selectClass} {...props}>
        {options?.map((option) => {
          const { value, label: text } = typeof option === "string" ? { value: option, label: option } : option;
          return <option key={value} value={value}>{text}</option>;
        })}
        {children}
      </select>
      {hint && <p className={hintClass}>{hint}</p>}
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

const badgeTones = {
  neutral: "bg-fg/6 text-fg-2",
  ok: "bg-ok/12 text-ok",
  warn: "bg-warn/12 text-warn",
  bad: "bg-bad/12 text-bad",
  info: "bg-info/12 text-info",
  accent: "bg-accent/12 text-accent",
};
// The names older pages use for the same tones.
const toneAlias = { amber: "warn", emerald: "ok", zinc: "neutral", blue: "info", red: "bad" } as const;
type Tone = keyof typeof badgeTones | keyof typeof toneAlias;

export function StatusBadge({ children, tone = "warn" }: { children: React.ReactNode; tone?: Tone }) {
  const resolved = tone in toneAlias ? toneAlias[tone as keyof typeof toneAlias] : (tone as keyof typeof badgeTones);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-xs font-medium tracking-normal whitespace-nowrap capitalize ${badgeTones[resolved]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

const noticeTones = {
  info: "border-info/25 bg-info/8",
  warn: "border-warn/30 bg-warn/8",
  bad: "border-bad/30 bg-bad/8",
};

// A message that sits above the content it concerns.
export function Notice({ tone = "info", title, children }: { tone?: keyof typeof noticeTones; title?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed text-fg ${noticeTones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}

// A quiet placeholder for a list with nothing in it yet.
export function Empty({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-fg-3">
      {icon && <div className="grid h-11 w-11 place-items-center rounded-full bg-sunken text-fg-3">{icon}</div>}
      <p className="max-w-sm whitespace-normal">{children}</p>
    </div>
  );
}

const summaryTones = { ok: "text-ok", accent: "text-accent", bad: "text-bad" };

// One line of a bill summary: a label on the left and its amount on the right.
export function SummaryRow({ label, value, strong = false, tone }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: keyof typeof summaryTones }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "border-t border-line pt-3 text-fg" : "text-sm"}`}>
      <dt className={strong ? "font-semibold" : "text-fg-3"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-serif text-xl font-medium" : ""} ${tone ? summaryTones[tone] : "text-fg"}`}>{value}</dd>
    </div>
  );
}

const hrefOf = (cell: React.ReactNode) =>
  isValidElement<{ href?: unknown }>(cell) && typeof cell.props.href === "string" ? cell.props.href : undefined;

// A table in a panel: header labels and rows of cells. Columns listed in `right` are right-aligned.
// A row whose first cell is a link opens that link when clicked anywhere, as a list row does on a Mac.
export function DataTable({ head, rows, empty, right = [] }: { head: string[]; rows: React.ReactNode[][]; empty: string; right?: number[] }) {
  const linked = rows.some((row) => hrefOf(row[0]));
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-fg-2">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} className={`${thClass} ${right.includes(i) ? "text-right" : ""}`}>{h}</th>
              ))}
              {linked && <th className={`${thClass} w-10`} aria-hidden="true" />}
            </tr>
          </thead>
          <tbody className="[&_td:first-child_a]:font-medium [&_td:first-child_a]:text-fg [&_td:first-child_a]:no-underline">
            {rows.length === 0 ? (
              <tr><td colSpan={head.length + (linked ? 1 : 0)}><Empty>{empty}</Empty></td></tr>
            ) : (
              rows.map((row, r) => {
                const href = hrefOf(row[0]);
                const cells = (
                  <>
                    {row.map((cell, i) => (
                      <td key={i} className={`${tdClass} ${right.includes(i) ? "text-right tabular-nums" : ""}`}>{cell}</td>
                    ))}
                    {linked && <td className="pr-4 text-fg-4">{href && <ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />}</td>}
                  </>
                );
                return href
                  ? <RowLink key={r} href={href} className={rowClass}>{cells}</RowLink>
                  : <tr key={r} className={rowClass}>{cells}</tr>;
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { linkClass } from "@/lib/styles";
