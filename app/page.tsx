import Link from "next/link";
import { Gem } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/10 p-2 rounded-lg">
            <Gem className="h-6 w-6 text-amber-500" />
          </div>
          <span className="text-lg font-semibold text-zinc-100">Shri Ram Jewellers</span>
        </div>
        <Link
          href="/login"
          className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
        >
          Staff Login
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-500">
          Gold &amp; Silver Jewellery
        </p>
        <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-7xl bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-transparent">
          Shri Ram Jewellers
        </h1>
        <p className="mt-6 max-w-xl text-lg text-zinc-400">
          Trusted craftsmanship in gold and silver ornaments, made to order, repaired with care.
        </p>
      </main>

      <footer className="px-6 py-6 text-center text-sm text-zinc-600">
        © {new Date().getFullYear()} Shri Ram Jewellers
      </footer>
    </div>
  );
}
