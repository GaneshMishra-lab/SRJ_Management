"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form";

// A plain form around a server action: shows its error or success message and a pending button.
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-4",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-emerald-400">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="px-5 py-2 rounded-xl bg-amber-500 text-zinc-950 text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition-all"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
