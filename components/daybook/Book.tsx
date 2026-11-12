"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/daybook/Sheet";
import { project, tally } from "@/lib/daybook/calc";
import type { Digits, Entry, Head, Lang, Side } from "@/lib/daybook/types";

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

  // On a phone each sheet shows one side at a time and is swiped to the other. Every sheet is kept
  // on the same side, and a new day opens at जमा.
  const bookRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<{ day: string; side: Side }>({ day, side: "credit" });
  if (side.day !== day) setSide({ day, side: "credit" });

  useEffect(() => {
    const book = bookRef.current;
    if (!book) return;
    const onScroll = (event: Event) => {
      const swiped = event.target as HTMLElement;
      if (!swiped.classList?.contains("daybook-columns")) return;
      for (const other of book.querySelectorAll<HTMLElement>(".daybook-columns")) {
        if (other !== swiped && other.scrollLeft !== swiped.scrollLeft) other.scrollLeft = swiped.scrollLeft;
      }
      const now: Side = swiped.scrollLeft > swiped.clientWidth / 2 ? "debit" : "credit";
      setSide((current) => (current.side === now ? current : { day, side: now }));
    };
    // A scroll does not bubble, so it is caught on its way down.
    book.addEventListener("scroll", onScroll, true);
    return () => book.removeEventListener("scroll", onScroll, true);
  }, [day]);

  return (
    <div className="daybook" lang={lang}>
      <div key={day} ref={bookRef} className="daybook-book" data-turn={turn}>
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
            showing={side.side}
            onAdd={onAdd}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
