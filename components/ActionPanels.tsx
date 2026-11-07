"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui";
import { btn, iconButtonClass } from "@/lib/styles";

type Panel = {
  key: string;
  label: string;
  title: string;
  hint?: React.ReactNode;
  danger?: boolean;
  wide?: boolean; // for forms laid out in several columns
  children: React.ReactNode;
};

// A row of buttons, each opening its own form below. One form is open at a time; pressing the
// open one's button again, or the cross, closes it.
export function ActionPanels({ panels }: { panels: Panel[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const current = panels.find((panel) => panel.key === open);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {panels.map((panel) => {
          const isOpen = panel.key === open;
          return (
            <button
              key={panel.key}
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : panel.key)}
              className={`${btn(isOpen ? "primary" : "secondary")} ${panel.danger && !isOpen ? "text-bad" : ""}`}
            >
              {panel.label}
            </button>
          );
        })}
      </div>
      {current && (
        <Card
          key={current.key}
          title={current.title}
          hint={current.hint}
          className={current.wide ? "" : "max-w-2xl"}
          action={
            <button type="button" aria-label="Close" title="Close" onClick={() => setOpen(null)} className={`-mt-1.5 -mr-2 ${iconButtonClass}`}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        >
          {current.children}
        </Card>
      )}
    </div>
  );
}
