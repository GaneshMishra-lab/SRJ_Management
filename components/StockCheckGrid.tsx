"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer, X } from "lucide-react";
import { saveStockCheck } from "@/app/actions/stockcheck";
import { ActionForm } from "@/components/ActionForm";
import { Segmented } from "@/components/controls";
import { Field, Notice, PageHeader } from "@/components/ui";
import type { BookRow, CheckPiece } from "@/lib/stockcheck/types";
import { btn, iconButtonClass, inputClass } from "@/lib/styles";

type Line = { added: number | null; removed: number | null; expected: number; away: number; counted: number; locker: number };
export type SavedCheck = { id: string; date: string; note: string | null; by: string | null; lines: Record<string, Line> };

// The register's own way of writing a day: 25/10/26.
const shortDay = (day: string) => {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};
const show = (n: number | null | undefined) => (n === null || n === undefined ? "" : Number.isInteger(n) ? String(n) : n.toFixed(3));
const parse = (value: string | undefined) => (value === undefined || value.trim() === "" ? null : Number(value));

const cell = "border-l border-line px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const head = "border-l border-line px-2 py-1 text-center text-[12px] font-medium whitespace-nowrap text-fg-3";
const countInput = `${inputClass} h-8 w-16 px-2 text-right tabular-nums`;

// A count as the register writes it: the pieces there, with how many of them are in the locker written small.
function Count({ counted, locker, wrong }: { counted: number; locker: number; wrong?: string }) {
  return (
    <span className={wrong ? "text-bad" : ""} title={wrong}>
      {show(counted)}
      {locker > 0 && <sup className="ml-0.5 text-[10px] font-medium text-accent">{show(locker)}</sup>}
    </span>
  );
}

export function StockCheckGrid({
  kinds,
  kind,
  metal,
  day,
  today,
  unit,
  awayLabel,
  rows,
  history,
  current,
  pieces,
}: {
  kinds: { kind: string; label: string; later?: boolean }[];
  kind: string;
  metal: string;
  day: string;
  today: string;
  unit: string;
  awayLabel: string;
  rows: BookRow[];
  history: SavedCheck[];
  current: SavedCheck | null;
  pieces: CheckPiece[];
}) {
  const router = useRouter();
  const go = (change: Record<string, string>) =>
    router.push(`/stock-check?${new URLSearchParams({ kind, metal, date: day, ...change })}`);

  // Only today's check can be written again; an earlier day's check stays as it was recorded.
  const editable = !current || day === today;
  const last = history.at(-1);
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, show(current?.lines[row.id]?.counted)])));
  // The locker is usually as it was at the last check, so that is where it starts.
  const [locker, setLocker] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, show(current?.lines[row.id]?.locker ?? last?.lines[row.id]?.locker ?? 0)])));
  const [open, setOpen] = useState<BookRow | null>(null);

  const fillFromBook = () =>
    setCounted((was) => Object.fromEntries(rows.map((row) => [row.id, was[row.id] || show(row.expected - row.away)])));

  const totals = useMemo(() => {
    const sum = (pick: (row: BookRow) => number | null) => rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
    return {
      added: sum((row) => row.added),
      removed: sum((row) => row.removed),
      expected: sum((row) => row.expected),
      away: sum((row) => row.away),
      counted: sum((row) => parse(counted[row.id])),
      locker: sum((row) => parse(locker[row.id])),
      history: history.map((check) => ({
        added: rows.reduce((total, row) => total + (check.lines[row.id]?.added ?? 0), 0),
        removed: rows.reduce((total, row) => total + (check.lines[row.id]?.removed ?? 0), 0),
        counted: rows.reduce((total, row) => total + (check.lines[row.id]?.counted ?? 0), 0),
        locker: rows.reduce((total, row) => total + (check.lines[row.id]?.locker ?? 0), 0),
      })),
    };
  }, [rows, counted, locker, history]);
  const allCounted = rows.every((row) => parse(counted[row.id]) !== null);
  const differing = rows.filter((row) => {
    const n = parse(counted[row.id]);
    return n !== null && n !== row.expected - row.away;
  }).length;

  const grid = (
    <div className="overflow-x-auto rounded-2xl border border-line bg-card shadow-card print:overflow-visible print:shadow-none">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <th rowSpan={2} className="sticky left-0 z-10 bg-card px-4 py-2 text-left text-[13px] font-medium text-fg-3">Item</th>
            {history.map((check) => (
              <th key={check.id} colSpan={3} className={`${head} text-fg`}>
                <Link href={`/stock-check?${new URLSearchParams({ kind, metal, date: check.date })}`} className="hover:underline" title={check.by ? `Checked by ${check.by}` : undefined}>
                  {shortDay(check.date)}
                </Link>
              </th>
            ))}
            <th colSpan={editable ? 8 : 7} className={`${head} bg-fg/4 text-fg`}>
              {shortDay(day)} {current ? (editable ? "· recorded, can be changed today" : `· recorded${current.by ? ` by ${current.by}` : ""}`) : "· this check"}
            </th>
          </tr>
          <tr className="border-b border-line">
            {history.map((check) => (
              <Fragment key={check.id}>
                <th className={head}>+</th>
                <th className={head}>−</th>
                <th className={head}>=</th>
              </Fragment>
            ))}
            <th className={`${head} bg-fg/4`}>+</th>
            <th className={`${head} bg-fg/4`}>−</th>
            <th className={`${head} bg-fg/4`} title="What the book says is there">Book</th>
            <th className={`${head} bg-fg/4`}>{awayLabel}</th>
            <th className={`${head} bg-fg/4`}>Counted</th>
            <th className={`${head} bg-fg/4`} title="Of the counted, how many are in the locker">Locker</th>
            <th className={`${head} bg-fg/4`} title="Counted less the locker">Display</th>
            {editable && <th className={`${head} bg-fg/4`}>Diff</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const n = parse(counted[row.id]);
            const l = parse(locker[row.id]) ?? 0;
            const diff = n === null ? null : n - (row.expected - row.away);
            const saved = current?.lines[row.id];
            return (
              <tr key={row.id} className="border-b border-line last:border-0 hover:bg-fg/3">
                <td className="sticky left-0 z-10 bg-card px-4 py-1.5 whitespace-nowrap">
                  <button type="button" onClick={() => setOpen(row)} className="font-medium text-fg hover:underline print:no-underline">
                    {row.name}
                  </button>
                </td>
                {history.map((check) => {
                  const line = check.lines[row.id];
                  const wrong = line && line.counted !== line.expected - line.away ? `The book said ${show(line.expected - line.away)}` : undefined;
                  return (
                    <Fragment key={check.id}>
                      <td className={`${cell} text-fg-3`}>{line?.added ? show(line.added) : ""}</td>
                      <td className={`${cell} text-fg-3`}>{line?.removed ? show(line.removed) : ""}</td>
                      <td className={cell}>{line && <Count counted={line.counted} locker={line.locker} wrong={wrong} />}</td>
                    </Fragment>
                  );
                })}
                <td className={`${cell} bg-fg/2 text-fg-3`}>{(saved?.added ?? row.added) ? show(saved?.added ?? row.added) : ""}</td>
                <td className={`${cell} bg-fg/2 text-fg-3`}>{(saved?.removed ?? row.removed) ? show(saved?.removed ?? row.removed) : ""}</td>
                <td className={`${cell} bg-fg/2`}>{show(editable ? row.expected : saved?.expected)}</td>
                <td className={`${cell} bg-fg/2 text-info`}>{(editable ? row.away : saved?.away) ? show(editable ? row.away : saved?.away) : ""}</td>
                {editable ? (
                  <>
                    <td className={`${cell} bg-fg/2 py-1`}>
                      <input
                        name={`counted:${row.id}`}
                        type="number" min="0" step="1" inputMode="numeric" required
                        aria-label={`${row.name} counted`}
                        value={counted[row.id] ?? ""}
                        onChange={(event) => setCounted({ ...counted, [row.id]: event.target.value })}
                        className={`${countInput} ${diff ? "border-bad text-bad" : ""}`}
                      />
                    </td>
                    <td className={`${cell} bg-fg/2 py-1`}>
                      <input
                        name={`locker:${row.id}`}
                        type="number" min="0" step="1" inputMode="numeric" required
                        aria-label={`${row.name} in the locker`}
                        value={locker[row.id] ?? ""}
                        onChange={(event) => setLocker({ ...locker, [row.id]: event.target.value })}
                        className={countInput}
                      />
                    </td>
                    <td className={`${cell} bg-fg/2 text-fg-2`}>{n === null ? "" : show(n - l)}</td>
                    <td className={`${cell} bg-fg/2 font-medium ${diff === null ? "" : diff === 0 ? "text-ok" : "text-bad"}`}>
                      {diff === null ? "" : diff === 0 ? "✓" : diff > 0 ? `+${show(diff)}` : `−${show(-diff)}`}
                    </td>
                  </>
                ) : (
                  <>
                    <td className={`${cell} bg-fg/2`}>
                      {saved && <Count counted={saved.counted} locker={saved.locker} wrong={saved.counted !== saved.expected - saved.away ? `The book said ${show(saved.expected - saved.away)}` : undefined} />}
                    </td>
                    <td className={`${cell} bg-fg/2`}>{saved ? show(saved.locker) : ""}</td>
                    <td className={`${cell} bg-fg/2 text-fg-2`}>{saved ? show(saved.counted - saved.locker) : ""}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line-strong font-semibold">
            <td className="sticky left-0 z-10 bg-card px-4 py-2">Total</td>
            {totals.history.map((total, i) => (
              <Fragment key={history[i].id}>
                <td className={`${cell} text-fg-3`}>{total.added || ""}</td>
                <td className={`${cell} text-fg-3`}>{total.removed || ""}</td>
                <td className={cell}><Count counted={total.counted} locker={total.locker} /></td>
              </Fragment>
            ))}
            <td className={`${cell} bg-fg/2 text-fg-3`}>{totals.added || ""}</td>
            <td className={`${cell} bg-fg/2 text-fg-3`}>{totals.removed || ""}</td>
            <td className={`${cell} bg-fg/2`}>{show(editable ? totals.expected : rows.reduce((t, row) => t + (current?.lines[row.id]?.expected ?? 0), 0))}</td>
            <td className={`${cell} bg-fg/2 text-info`}>{totals.away || ""}</td>
            {editable ? (
              <>
                <td className={`${cell} bg-fg/2`}>{show(totals.counted)}</td>
                <td className={`${cell} bg-fg/2`}>{show(totals.locker)}</td>
                <td className={`${cell} bg-fg/2 text-fg-2`}>{show(totals.counted - totals.locker)}</td>
                <td className={`${cell} bg-fg/2 ${differing ? "text-bad" : allCounted ? "text-ok" : ""}`}>
                  {differing ? `${differing} off` : allCounted ? "✓" : ""}
                </td>
              </>
            ) : (
              <>
                <td className={`${cell} bg-fg/2`}>{show(rows.reduce((t, row) => t + (current?.lines[row.id]?.counted ?? 0), 0))}</td>
                <td className={`${cell} bg-fg/2`}>{show(rows.reduce((t, row) => t + (current?.lines[row.id]?.locker ?? 0), 0))}</td>
                <td className={`${cell} bg-fg/2 text-fg-2`}>
                  {show(rows.reduce((t, row) => t + (current ? (current.lines[row.id]?.counted ?? 0) - (current.lines[row.id]?.locker ?? 0) : 0), 0))}
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const openPieces = open ? pieces.filter((piece) => piece.subjectId === open.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock check"
        subtitle={`${metal} · ${unit} per item type, against the book. A small number beside a count is how many are in the locker.`}
      >
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Segmented
            label="Kind of stock"
            value={kind}
            onChange={(value) => go({ kind: value })}
            options={kinds.map((k) => ({ value: k.kind, label: k.label, disabled: k.later, title: k.later ? `${k.label}: coming later` : undefined }))}
          />
          <Segmented label="Metal" value={metal} onChange={(value) => go({ metal: value })} options={[{ value: "Gold", label: "Gold" }, { value: "Silver", label: "Silver" }]} />
          <input
            type="date"
            aria-label="Day of the check"
            value={day}
            max={today}
            onChange={(event) => event.target.value && go({ date: event.target.value })}
            className={`${inputClass} w-auto`}
          />
          <button type="button" onClick={() => window.print()} aria-label="Print" title="Print" className={iconButtonClass}>
            <Printer className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>
      </PageHeader>

      {rows.length === 0 ? (
        <Notice>No {metal.toLowerCase()} {kind} stock to check.</Notice>
      ) : editable ? (
        <ActionForm
          action={saveStockCheck.bind(null, kind, metal)}
          submitLabel={current ? "Save changes to today's check" : "Record stock check"}
        >
          <input type="hidden" name="date" value={day} />
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <p className="text-[13px] text-fg-3">
              Count each box and type what is there, and how many of those are in the locker.
              {awayLabel && " Pieces out on approval are in the book but not in the box, so they are taken off before comparing."}
            </p>
            <button type="button" onClick={fillFromBook} className={btn("secondary", "sm")} title="Fill every empty count with the book figure, then correct the ones that differ">
              Fill counts from book
            </button>
          </div>
          {grid}
          <Field label="Note (optional)" name="note" type="text" defaultValue={current?.note ?? ""} placeholder="e.g. Monthly check" className="max-w-md print:hidden" />
        </ActionForm>
      ) : (
        <>
          {grid}
          {current?.note && <p className="text-sm text-fg-2">Note: {current.note}</p>}
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-40 print:hidden" role="dialog" aria-label={`${open.name} in stock`}>
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/20" onClick={() => setOpen(null)} />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-line bg-card shadow-card">
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-fg">{open.name}</h2>
                <p className="mt-0.5 text-[13px] text-fg-3">{openPieces.length} {unit} in stock now, by label</p>
              </div>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className={`-mr-2 ${iconButtonClass}`}>
                <X className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
            </header>
            <ul className="flex-1 divide-y divide-line overflow-y-auto">
              {openPieces.map((piece) => (
                <li key={piece.id}>
                  <Link href={`/inventory/${piece.id}`} className="flex items-center justify-between gap-3 px-5 py-2 text-sm hover:bg-fg/3">
                    <span className="font-medium tabular-nums">#{piece.label ?? "-"}</span>
                    <span className="flex items-center gap-2 text-fg-3 tabular-nums">
                      {piece.away && <span className="text-[12px] text-info">{awayLabel}</span>}
                      {piece.weight !== null && `${piece.weight.toFixed(3)} g`}
                    </span>
                  </Link>
                </li>
              ))}
              {openPieces.length === 0 && <li className="px-5 py-4 text-sm text-fg-3">None in stock now.</li>}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
