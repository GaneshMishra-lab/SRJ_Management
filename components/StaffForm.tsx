"use client";

import { useActionState } from "react";
import { createStaffUser } from "@/app/actions/users";

const inputClass =
  "w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none";

export function StaffForm() {
  const [state, action, pending] = useActionState(createStaffUser, undefined);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-zinc-300">Name</label>
          <input id="name" name="name" type="text" className={inputClass} required />
        </div>
        <div className="space-y-2">
          <label htmlFor="contact" className="text-sm font-medium text-zinc-300">Contact number (optional)</label>
          <input id="contact" name="contact" type="tel" className={inputClass} />
        </div>
        <div className="space-y-2">
          <label htmlFor="username" className="text-sm font-medium text-zinc-300">Username</label>
          <input id="username" name="username" type="text" autoComplete="off" className={inputClass} required />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-zinc-300">Password (8+ characters)</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} className={inputClass} required />
        </div>
      </div>

      {state?.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      {state?.success && <p role="status" className="text-sm text-emerald-400">{state.success}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2 rounded-xl bg-amber-500 text-zinc-950 text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition-all"
        >
          {pending ? "Saving..." : "Create staff login"}
        </button>
      </div>
    </form>
  );
}
