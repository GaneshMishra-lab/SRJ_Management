import Link from "next/link";
import { redirect } from "next/navigation";
import { Gem } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import { readSession } from "@/lib/session";

export default async function LoginPage() {
  if (await readSession()) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center text-center">
          <Link href="/" className="bg-amber-500/10 p-3 rounded-xl">
            <Gem className="h-8 w-8 text-amber-500" />
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-zinc-100">Shri Ram Jewellers</h1>
          <p className="mt-1 text-sm text-zinc-400">Staff login</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-6 backdrop-blur-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
