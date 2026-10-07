"use client";

import { useEffect, useRef, useState } from "react";
import { Field } from "@/components/ui";
import { creditDaysOf, dueDateFrom } from "@/lib/due";
import { dateOnly, istDate } from "@/lib/format";

export type Credit = { creditDays: string; dueDate: string };

// The supplier's credit on what is left unpaid: typed as a number of days, or as the due date,
// each showing what the other comes to. Only the one that was typed is sent (as creditDays or
// dueDate), and the server counts days from the entry's own day. Read there with parseDue().
export function CreditFields({
  baseDay,
  onChange,
  className = "grid grid-cols-2 gap-4",
}: {
  baseDay?: string; // the day credit is counted from, when the entry is not today's
  onChange?: (credit: Credit) => void; // for a form that gathers its own fields
  className?: string;
}) {
  const [typed, setTyped] = useState<{ by: "days" | "date"; value: string }>({ by: "days", value: "" });
  const hidden = useRef<HTMLInputElement>(null);
  const from = baseDay || istDate();

  const days = typed.by === "days" ? typed.value : creditDaysOf(from, typed.value);
  const wholeDays = /^\d{1,4}$/.test(days.trim()) ? Number(days) : null;
  const date = typed.by === "date" ? typed.value : wholeDays === null ? "" : dueDateFrom(from, wholeDays);

  const type = (by: "days" | "date", value: string) => {
    setTyped({ by, value });
    onChange?.({ creditDays: by === "days" ? value : "", dueDate: by === "date" ? value : "" });
  };

  // A form sent to a server action is cleared once it is saved; clear what is held here with it.
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const clear = () => setTyped({ by: "days", value: "" });
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  return (
    <div className={className}>
      <input ref={hidden} type="hidden" name="creditDays" value={typed.by === "days" ? typed.value : ""} />
      <input type="hidden" name="dueDate" value={typed.by === "date" ? typed.value : ""} />
      <Field
        label="Credit (days)"
        type="number"
        inputMode="numeric"
        step="1"
        min="0"
        placeholder="e.g. 45"
        value={days}
        onChange={(event) => type("days", event.target.value)}
      />
      <Field
        label="Due date"
        type="date"
        min={from}
        value={date}
        onChange={(event) => type("date", event.target.value)}
        hint={date ? `To be paid by ${dateOnly(date)}.` : "Leave both empty if no date was agreed."}
      />
    </div>
  );
}
