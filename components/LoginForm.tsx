"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Field } from "@/components/ui";
import { btn } from "@/lib/styles";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-4">
      <Field label="Username" name="username" type="text" autoComplete="username" autoFocus required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />

      {state?.error && (
        <p role="alert" className="text-sm text-bad">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className={`${btn()} w-full`}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
