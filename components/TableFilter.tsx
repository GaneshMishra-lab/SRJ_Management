"use client";

import { useEffect, useRef, useState } from "react";
import { matches, SearchField } from "@/components/controls";

// One search box over every table inside it. It filters the rows already on the page as you type:
// a row stays when every word typed is somewhere in its text, including text kept in a `hidden`
// span (phone, notes, plain amounts and dates), so a row can be found by what it does not show.
// A block marked data-filter-group gets its own "nothing matches" line.
export function TableFilter({ placeholder = "Search", children }: { placeholder?: string; children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [count, setCount] = useState<{ shown: number; total: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = box.current;
    if (!root) return;
    let shown = 0;
    let total = 0;
    const groups = root.querySelectorAll<HTMLElement>("[data-filter-group]");
    for (const group of groups) {
      let inGroup = 0;
      let rows = 0;
      for (const row of group.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
        if (row.querySelector("td[colspan]")) continue; // the table's own "nothing here" row
        rows += 1;
        const keep = matches(query, row.textContent);
        row.style.display = keep ? "" : "none";
        if (keep) inGroup += 1;
      }
      const none = group.querySelector<HTMLElement>("[data-filter-none]");
      if (none) none.hidden = !query || rows === 0 || inGroup > 0;
      shown += inGroup;
      total += rows;
    }
    setCount(query ? { shown, total } : null);
  }, [query, children]);

  return (
    <div ref={box} className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField value={query} onChange={setQuery} placeholder={placeholder} />
        {count && <p className="text-sm text-fg-3" aria-live="polite">{count.shown} of {count.total} match</p>}
      </div>
      {children}
    </div>
  );
}
