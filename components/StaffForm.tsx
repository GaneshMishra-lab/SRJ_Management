"use client";

import { useActionState } from "react";
import { createStaffUser } from "@/app/actions/users";
import { Field } from "@/components/ui";
import { btn } from "@/lib/styles";

export function StaffForm() {
  const [state, action, pending] = useActionState(createStaffUser, undefined);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Name" name="name" type="text" required />
        <Field label="Contact number (optional)" name="contact" type="tel" />
        <Field label="Username" name="username" type="text" autoComplete="off" required />
        <Field label="Password (8+ characters)" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>

      {state?.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-ok">{state.success}</p>}

      <button type="submit" disabled={pending} className={btn()}>
        {pending ? "Saving..." : "Create staff login"}
      </button>
    </form>
  );
}
