import { Fragment } from "react";
import Link from "next/link";
import { headName, labelsFor, money, weightText } from "@/lib/daybook/i18n";
import type { Digits, Entry, Head, Lang, Line } from "@/lib/daybook/types";

// One account head as the book draws it: its total on a short line, an upright stroke, then the
// title. Its entries are written underneath, each amount under the total.
export function HeadBlock({
  head,
  lines,
  total,
  lang,
  digits,
  written,
  onAdd,
  onOpen,
}: {
  head: Head;
  lines: Line[];
  total: number | null;
  lang: Lang;
  digits: Digits;
  written: ReadonlySet<string>; // entries just saved, which are shown being written
  onAdd?: () => void;
  onOpen?: (entry: Entry) => void;
}) {
  const t = labelsFor(lang);
  const name = head.id.startsWith("unassigned-") ? t.unassigned : headName(head, lang);
  // Room left under the heading for writing; the opening cash needs a single line.
  const blank = head.role === "opening" ? 1 : 4;

  return (
    <section className="daybook-head" style={{ "--blank": blank } as React.CSSProperties}>
      <h3 className="daybook-head-row">
        <span className="daybook-total"><span className="daybook-ink">{total === null ? "" : money(total, digits)}</span></span>
        <span className="daybook-title"><span className="daybook-ink">{name}</span></span>
        {onAdd && (
          <button type="button" onClick={onAdd} className="daybook-add" aria-label={`${t.addUnder}: ${name}`} title={t.addUnder}>+</button>
        )}
      </h3>
      {lines.length > 0 && (
        <ol className="daybook-lines">
          {lines.map((line) => {
            const { entry } = line;
            // The spaces between the parts are where a long line may wrap. A contra line names
            // only the party; the rest is written once, under the entry's own head.
            const cells = (
              <>
                <span className="daybook-amt"><span className="daybook-ink">{money(line.amt, digits)}</span></span>
                <span className="daybook-what">
                  <span className="daybook-ink">
                    {entry.party}
                    {entry.tag && <> <span className="daybook-more" data-whole="">{t.tags[entry.tag]}</span></>}
                    {!line.contra && entry.weight !== null && <> <span className="daybook-more" data-whole="">{weightText(entry.weight, lang, digits)}</span></>}
                    {line.fields.map((field) => field.type === "text" && entry.extra[field.key] && (
                      <Fragment key={field.key}> <span className="daybook-more">{entry.extra[field.key]}</span></Fragment>
                    ))}
                    {!line.contra && entry.note && <> <span className="daybook-more">{entry.note}</span></>}
                    {entry.mode !== "cash" && <> <span className="daybook-more" data-whole="">({t.modes[entry.mode]})</span></>}
                  </span>
                </span>
              </>
            );
            return (
              <li key={line.id} className="daybook-line" data-writing={written.has(entry.id) ? "" : undefined}>
                {/* A line the page can change itself opens in the form; any other opens where it was made. */}
                {entry.editable && onOpen ? (
                  <button type="button" onClick={() => onOpen(entry)} className="daybook-row">{cells}</button>
                ) : entry.href ? (
                  <Link href={entry.href} className="daybook-row">{cells}</Link>
                ) : (
                  <div className="daybook-row">{cells}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
