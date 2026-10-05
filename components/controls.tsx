"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

// The interactive building blocks: the ones that need the browser.

// A table row that opens its page when clicked anywhere on it. Links and controls inside still work as themselves.
export function RowLink({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={`cursor-pointer ${className}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button, input, select, textarea, summary, form")) return;
        if (window.getSelection()?.toString()) return; // the user was selecting text, not clicking
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

// A choice between a few options, all visible at once.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`inline-flex h-10 items-stretch rounded-ctl bg-fg/6 p-[3px] ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          title={option.title}
          aria-label={option.title}
          onClick={() => onChange(option.value)}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[0.45rem] px-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
            option.value === value ? "bg-card text-fg shadow-card" : "text-fg-3 hover:text-fg"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Filters a list as you type. Pressing "/" jumps to it; Escape clears it.
export function SearchField({ value, onChange, placeholder = "Search" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
      <input
        ref={input}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onChange("")}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-ctl border border-line-strong bg-field pr-9 pl-9 text-sm text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-4 hover:border-fg-4 focus:border-focus focus:ring-3 focus:ring-focus/20 sm:w-64"
      />
      {value ? (
        <button
          type="button"
          onClick={() => { onChange(""); input.current?.focus(); }}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-fg-4 text-card hover:bg-fg-3"
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-line px-1.5 font-sans text-[11px] leading-5 text-fg-4" aria-hidden="true">/</kbd>
      )}
    </div>
  );
}

// Every word typed must appear somewhere in the row's text.
export const matches = (query: string, ...fields: (string | number | null | undefined)[]) => {
  const haystack = fields.join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
};
