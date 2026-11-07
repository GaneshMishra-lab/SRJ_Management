"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/lib/form";

// Turns "counted in pieces" on or off for one loose type, saving at once.
export function CountedSwitch({ typeId, counted, action }: { typeId: string; counted: boolean; action: (typeId: string, counted: boolean) => Promise<FormState> }) {
  const [on, setOn] = useState(counted);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setOn(next);
            startTransition(async () => {
              const result = await action(typeId, next);
              if (result?.error) setOn(!next);
              setMessage(result?.error ?? result?.success ?? null);
            });
          }}
          className="h-4 w-4 accent-accent"
        />
        Count this type in pieces as well as weight
      </label>
      {message && <p className="text-[13px] text-fg-3" aria-live="polite">{message}</p>}
    </div>
  );
}
