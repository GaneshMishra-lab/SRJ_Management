"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { grams } from "@/lib/format";
import { searchPieces, type SearchablePiece } from "@/lib/piece-search";
import { stockStatus } from "@/lib/styles";
import { StatusBadge } from "@/components/ui";

// Shown at once; the rest are reached by typing more.
const SHOWN = 30;

// A search box that lists matching pieces under it as you type. Arrow keys move through the list,
// Enter picks, Escape clears, and "/" jumps to it from anywhere on the page. The same box is used
// to add a piece to a sale and to look one up in the inventory.
export function PieceSearch<T extends SearchablePiece>({
  pieces,
  onPick,
  placeholder = "Search by label, type, weight or HUID",
  emptyText = "No piece matches.",
}: {
  pieces: T[];
  onPick: (piece: T) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const found = searchPieces(pieces, query);
  const shown = found.slice(0, SHOWN);
  const showList = open && query.trim() !== "";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest("input, select, textarea, [contenteditable]");
      if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const type = (value: string) => {
    setQuery(value);
    setActive(0);
    setOpen(true);
  };
  const pick = (piece: T) => {
    onPick(piece);
    setQuery("");
    setActive(0);
    input.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (shown.length === 0 ? 0 : (index + step + shown.length) % shown.length));
    } else if (event.key === "Enter") {
      // Never submits the form the box sits in.
      event.preventDefault();
      if (showList && shown[active]) pick(shown[active]);
    } else if (event.key === "Escape") {
      if (query) event.preventDefault();
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && shown[active] ? `${listId}-${active}` : undefined}
        aria-label={placeholder}
        autoComplete="off"
        value={query}
        onChange={(event) => type(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-11 w-full rounded-ctl border border-line-strong bg-field pr-9 pl-9 text-[15px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-4 hover:border-fg-4 focus:border-focus focus:ring-3 focus:ring-focus/20"
      />
      {query ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => type("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-fg-4 text-card hover:bg-fg-3"
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-line px-1.5 font-sans text-[11px] leading-5 text-fg-4" aria-hidden="true">/</kbd>
      )}

      {showList && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-card shadow-pop">
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-fg-3">{emptyText}</p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Matching pieces" className="max-h-80 overflow-y-auto py-1">
              {shown.map((piece, index) => {
                const status = stockStatus[piece.status ?? ""];
                const away = piece.status !== "stock" && piece.status !== "on_approval";
                return (
                  <li
                    key={piece.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    // Picked on mouse down, so the box keeps its focus for the next search.
                    onMouseDown={(event) => { event.preventDefault(); pick(piece); }}
                    onMouseEnter={() => setActive(index)}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${index === active ? "bg-fg/6" : ""}`}
                  >
                    <span className={`min-w-0 flex-1 truncate ${away ? "text-fg-3" : "text-fg"}`}>
                      <span className="font-medium">{piece.typeName ?? "Piece"} #{piece.label ?? "-"}</span>
                      <span className="text-fg-3"> · {piece.metal ?? "-"}</span>
                      {piece.huid && <span className="text-fg-3"> · {piece.huid}</span>}
                    </span>
                    <span className="text-fg-2 tabular-nums">{grams(piece.netWeight)}</span>
                    {status && piece.status !== "stock" && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                  </li>
                );
              })}
            </ul>
          )}
          {found.length > shown.length && (
            <p className="border-t border-line px-4 py-2 text-[13px] text-fg-3">
              {found.length - shown.length} more. Type more to narrow it down, such as “ring 45” or “chain 8.2”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
