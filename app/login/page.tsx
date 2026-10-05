import Link from "next/link";
import { redirect } from "next/navigation";
import { Gem } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import { readSession } from "@/lib/session";

export default async function LoginPage() {
  if (await readSession()) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Link href="/" aria-label="Shri Ram Jewellers home" className="rounded-full p-2">
            <Gem className="h-8 w-8 text-accent" strokeWidth={1.5} />
          </Link>
          <h1 className="mt-4 text-[2rem] leading-tight text-fg">Shri Ram Jewellers</h1>
          <p className="mt-2 text-fg-3">Sign in to the shop&apos;s books</p>
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-card p-6 shadow-card">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
