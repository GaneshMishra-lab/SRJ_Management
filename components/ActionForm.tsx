"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form";
import { btn } from "@/lib/styles";

// A plain form around a server action: shows its error or success message and a pending button.
// `tone="danger"` gives the red button, for actions that cannot be undone.
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-4",
  tone = "primary",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
  tone?: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-ok">{state.success}</p>}
      <button type="submit" disabled={pending} className={btn(tone)}>
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
