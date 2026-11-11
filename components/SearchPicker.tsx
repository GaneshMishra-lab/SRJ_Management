"use client";

import { useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { hintClass, labelClass } from "@/lib/styles";

// Shown at once; the rest are reached by typing more.
const SHOWN = 30;

// The same search box as PieceSearch, for any short list: customers, loose lots. Every word typed
// must appear in the item's text. The list opens on focus, so a short list can also be browsed.
// Arrow keys move, Enter picks, Escape closes.
//
// With `selected`, the box holds a choice (a customer) and shows it when not being typed in.
// Without it, picking adds the item and the box empties for the next one (loose metal).
// `extra` is one more choice always at the foot of the list, such as "+ Add new customer";
// it is handed what was typed, so a new name need not be typed twice.
export function SearchPicker<T>({
  items,
  itemKey,
  itemText,
  renderItem,
  onPick,
  selected,
  extra,
  label,
  hint,
  placeholder = "Search",
  emptyText = "Nothing matches.",
}: {
  items: T[];
  itemKey: (item: T) => string;
  itemText: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  selected?: string | null;
  extra?: { label: string; onPick: (typed: string) => void };
  label?: string;
  hint?: React.ReactNode;
  placeholder?: string;
  emptyText?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  // null: not typing, the box shows the choice made (if any).
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const found = items.filter((item) => {
    const text = itemText(item).toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const shown = found.slice(0, SHOWN);
  const choices = shown.length + (extra ? 1 : 0);

  const type = (value: string) => {
    setQuery(value);
    setActive(0);
    setOpen(true);
  };
  const close = () => {
    setQuery(null);
    setOpen(false);
    setActive(0);
  };
  const pickAt = (index: number) => {
    const typed = (query ?? "").trim();
    if (index < shown.length) onPick(shown[index]);
    else if (extra) extra.onPick(typed);
    else return;
    close();
    // A box that adds stays ready for the next one; a box that holds a choice lets go.
    if (selected === undefined) input.current?.focus();
    else input.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (choices === 0 ? 0 : (index + step + choices) % choices));
    } else if (event.key === "Enter") {
      // Never submits the form the box sits in.
      event.preventDefault();
      if (open && choices > 0) pickAt(active);
    } else if (event.key === "Escape") {
      if (open || query) event.preventDefault();
      close();
    }
  };

  const shownText = query ?? selected ?? "";

  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id} className={labelClass}>{label}</label>}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
        <input
          ref={input}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && choices > 0 ? `${listId}-${active}` : undefined}
          aria-label={label ? undefined : placeholder}
          autoComplete="off"
          value={shownText}
          onChange={(event) => type(event.target.value)}
          onFocus={(event) => { event.target.select(); setOpen(true); }}
          onClick={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="h-11 w-full rounded-ctl border border-line-strong bg-field pr-9 pl-9 text-[15px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-4 hover:border-fg-4 focus:border-focus focus:ring-3 focus:ring-focus/20"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => type("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2.5 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-fg-4 text-card hover:bg-fg-3"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}

        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-card shadow-pop">
            {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg-3">{emptyText}</p>}
            {choices > 0 && (
              <ul id={listId} role="listbox" aria-label={label ?? placeholder} className="max-h-80 overflow-y-auto py-1">
                {shown.map((item, index) => (
                  <li
                    key={itemKey(item)}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => { event.preventDefault(); pickAt(index); }}
                    onMouseEnter={() => setActive(index)}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${index === active ? "bg-fg/6" : ""}`}
                  >
                    {renderItem(item)}
                  </li>
                ))}
                {extra && (
                  <li
                    id={`${listId}-${shown.length}`}
                    role="option"
                    aria-selected={active === shown.length}
                    onMouseDown={(event) => { event.preventDefault(); pickAt(shown.length); }}
                    onMouseEnter={() => setActive(shown.length)}
                    className={`cursor-pointer border-t border-line px-4 py-2.5 text-sm font-medium text-fg ${active === shown.length ? "bg-fg/6" : ""}`}
                  >
                    {extra.label}
                    {query?.trim() && <span className="font-normal text-fg-3"> “{query.trim()}”</span>}
                  </li>
                )}
              </ul>
            )}
            {found.length > shown.length && (
              <p className="border-t border-line px-4 py-2 text-[13px] text-fg-3">{found.length - shown.length} more. Type more to narrow it down.</p>
            )}
          </div>
        )}
      </div>
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}
