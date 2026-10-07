import { Sheet } from "@/components/daybook/Sheet";
import { project, tally } from "@/lib/daybook/calc";
import type { Digits, Entry, Head, Lang } from "@/lib/daybook/types";

// The book open at one day: a picture of what has been entered, a sheet for each page of heads.
export function Book({
  day,
  heads,
  entries,
  opening,
  bank,
  invocation,
  lang,
  digits,
  turn,
  written,
  onAdd,
  onOpen,
}: {
  day: string;
  heads: Head[];
  entries: Entry[];
  opening: number;
  bank: number;
  invocation: string | null;
  lang: Lang;
  digits: Digits;
  turn?: "next" | "prev"; // which way the page was turned to reach this day
  written: ReadonlySet<string>;
  onAdd?: (head: Head) => void;
  onOpen?: (entry: Entry) => void;
}) {
  const lines = project(entries, heads);
  // A hidden head is still written on a day that has entries under it.
  const used = new Set(lines.map((line) => line.headId));
  const visible = heads
    .filter((head) => head.active || used.has(head.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const result = tally(visible, lines, opening);
  const pages = [...new Set(visible.map((head) => head.page))].sort();

  return (
    <div className="daybook" lang={lang}>
      <div key={day} className="daybook-book" data-turn={turn}>
        {pages.map((page, index) => (
          <Sheet
            key={page}
            no={index + 1}
            last={index === pages.length - 1}
            day={day}
            heads={visible.filter((head) => head.page === page)}
            tally={result}
            bank={bank}
            invocation={invocation}
            lang={lang}
            digits={digits}
            written={written}
            onAdd={onAdd}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
