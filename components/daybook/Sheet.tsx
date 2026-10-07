import { HeadBlock } from "@/components/daybook/HeadBlock";
import type { Tally } from "@/lib/daybook/calc";
import { labelsFor, longDate, MARKS, money, toDigits } from "@/lib/daybook/i18n";
import type { Digits, Entry, Head, Lang, Side } from "@/lib/daybook/types";

const sides: Side[] = ["credit", "debit"];

// One sheet of a day. The first carries the invocation and the date; the last carries the totals.
export function Sheet({
  no,
  last,
  day,
  heads,
  tally,
  bank,
  invocation,
  lang,
  digits,
  written,
  onAdd,
  onOpen,
}: {
  no: number;
  last: boolean;
  day: string;
  heads: Head[];
  tally: Tally;
  bank: number;
  invocation: string | null;
  lang: Lang;
  digits: Digits;
  written: ReadonlySet<string>;
  onAdd?: (head: Head) => void;
  onOpen?: (entry: Entry) => void;
}) {
  const t = labelsFor(lang);
  const first = no === 1;
  const date = `${t.date} : ${longDate(day, lang, digits)}`;
  const opensWithCash = heads.find((head) => head.side === "credit")?.role === "opening";

  return (
    <section className="daybook-sheet">
      <header className="daybook-marks">
        {MARKS.map((mark) => <span key={mark}>{mark}</span>)}
      </header>
      {first && invocation && <p className="daybook-invocation">{invocation}</p>}
      {first
        ? <p className="daybook-date">{date}</p>
        : <p className="daybook-date" data-small="">{date} · {t.sheet} {toDigits(String(no), digits)}</p>}

      <div className="daybook-ruled">
        <div className="daybook-columns">
          {sides.map((side) => (
            <div key={side} className="daybook-col" data-side={side}>
              <h2 className="daybook-col-title"><span className="daybook-ink">{side === "credit" ? t.credit : t.debit}</span></h2>
              {side === "debit" && opensWithCash && <div className="daybook-lead" aria-hidden="true" />}
              {heads.filter((head) => head.side === side).map((head) => (
                <HeadBlock
                  key={head.id}
                  head={head}
                  lines={tally.linesByHead.get(head.id) ?? []}
                  total={tally.totals.get(head.id) ?? null}
                  lang={lang}
                  digits={digits}
                  written={written}
                  // The opening cash is brought forward, never typed.
                  onAdd={onAdd && head.active && head.role !== "opening" ? () => onAdd(head) : undefined}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ))}
        </div>

        {last && (
          <div className="daybook-feet">
            <Sum label={t.totalCredit} amt={money(tally.credit, digits)} />
            <Sum label={t.totalDebit} amt={money(tally.debit, digits)} />
            {/* Beside the cash in hand, for reference: what the bank holds. It is no part of the totals. */}
            <Sum label={t.bankBalance} amt={money(bank, digits)} kind="aside" />
            <Sum label={t.closing} amt={money(tally.closing, digits)} kind="closing" />
          </div>
        )}
      </div>
    </section>
  );
}

function Sum({ label, amt, kind }: { label: string; amt: string; kind?: "closing" | "aside" }) {
  return (
    <p className="daybook-row daybook-sum" data-closing={kind === "closing" ? "" : undefined} data-aside={kind === "aside" ? "" : undefined}>
      <span className="daybook-amt"><span className="daybook-ink">{amt}</span></span>
      <span className="daybook-what"><span className="daybook-ink">{label}</span></span>
    </p>
  );
}
