import Link from "next/link";
import { Gem } from "lucide-react";
import { btn } from "@/lib/styles";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <Gem className="h-5 w-5 text-accent" />
          <span className="font-serif text-lg font-medium text-fg">Shri Ram Jewellers</span>
        </div>
        <Link href="/login" className={btn("secondary")}>
          Staff login
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <p className="text-sm font-medium tracking-wide text-accent">
          Gold &amp; silver jewellery
        </p>
        <h1 className="mt-5 text-5xl leading-[1.05] font-normal text-fg sm:text-7xl">
          Shri Ram Jewellers
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-3">
          Trusted craftsmanship in gold and silver ornaments, made to order, repaired with care.
        </p>
      </main>

      <footer className="px-6 py-6 text-center text-sm text-fg-4">
        © {new Date().getFullYear()} Shri Ram Jewellers
      </footer>
    </div>
  );
}
