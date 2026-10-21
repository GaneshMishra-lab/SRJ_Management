import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Serif_Devanagari } from "next/font/google";
import { ArrowRight, Clock, Gem, Hammer, MapPin, MessageCircle, Phone, Recycle, ShieldCheck, Sparkles } from "lucide-react";
import { CategoryArt, type CategoryArtKind } from "@/components/landing/CategoryArt";
import { Necklace } from "@/components/landing/Necklace";
import { readSession } from "@/lib/session";
import { shop, telHref, whatsappHref } from "@/lib/shop";
import { btn } from "@/lib/styles";

// The shop's name in Devanagari; the app's own fonts have no Devanagari letters.
const devanagari = Noto_Serif_Devanagari({ subsets: ["devanagari"], weight: ["500"] });

export const metadata: Metadata = {
  title: `${shop.name} · Gold & silver jewellery`,
  description: "Hallmarked gold, everyday silver, and jewellery made to your own design. Repairs, polishing and old gold exchange.",
};

const collections: { kind: CategoryArtKind; name: string; note: string; metals: string[] }[] = [
  { kind: "rings", name: "Rings", note: "Everyday bands to stone-set rings", metals: ["Gold", "Silver"] },
  { kind: "earrings", name: "Earrings", note: "Tops, jhumkas, balis, dul and kan-chains", metals: ["Gold"] },
  { kind: "chains", name: "Chains", note: "Neck chains in every weight and pattern", metals: ["Gold"] },
  { kind: "pendants", name: "Pendants & lockets", note: "Lockets and pendants to wear on a chain", metals: ["Gold"] },
  { kind: "mangalsutra", name: "Mangalsutra & mani", note: "Black-bead mangalsutras, strung to your length", metals: ["Gold"] },
  { kind: "silver", name: "Silver", note: "Payal, bichhiya, rings and gifts", metals: ["Silver"] },
];

const promises = [
  { icon: ShieldCheck, label: "Hallmarked gold" },
  { icon: Gem, label: "Gold & silver" },
  { icon: Sparkles, label: "Made to order" },
  { icon: Recycle, label: "Old gold exchange" },
];

const orderSteps = [
  { title: "Choose a design", body: "Pick one in the shop, or bring a photo of a piece you have seen and liked." },
  { title: "Agree weight and price", body: "We go over the weight, purity and making charge with you, and take an advance." },
  { title: "Collect your piece", body: "We call you when it is ready, and you pay the balance when you collect it." },
];

const services = [
  {
    icon: Hammer,
    title: "Repairs & polishing",
    body: "Broken hooks and clasps, resizing, re-setting loose stones, and a polish that brings old pieces back to life.",
  },
  {
    icon: Recycle,
    title: "Old gold exchange",
    body: "Bring your old gold. We test its purity, weigh it, and give you its value against new jewellery.",
  },
];

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
const eyebrowBase = "text-[13px] font-medium tracking-[0.14em] uppercase";
const eyebrow = `${eyebrowBase} text-gold`;

export default async function LandingPage() {
  const signedIn = Boolean(await readSession());
  const hasVisit = Boolean(shop.address || shop.hours || shop.phone);

  // The one way to get in touch that the page leads with, best first.
  const contact = shop.whatsapp
    ? { href: whatsappHref(shop.whatsapp), label: "Ask on WhatsApp", icon: MessageCircle, external: true }
    : shop.phone
      ? { href: telHref(shop.phone), label: "Call the shop", icon: Phone, external: false }
      : null;

  const nav = [
    { href: "#collections", label: "Collections" },
    { href: "#made-to-order", label: "Made to order" },
    { href: "#services", label: "Services" },
    ...(hasVisit ? [{ href: "#visit", label: "Visit" }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
        <div className={`${container} flex h-16 items-center justify-between gap-4`}>
          <Link href="/" className="flex items-center gap-2.5 rounded-ctl">
            <Gem className="h-5 w-5 text-gold" strokeWidth={1.6} />
            <span className="font-serif text-lg font-medium whitespace-nowrap text-fg">{shop.name}</span>
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="rounded-ctl px-3 py-2 text-sm text-fg-2 transition-colors hover:text-fg">
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {signedIn && (
              <Link href="/dashboard" className={btn("secondary", "sm")}>
                Dashboard
              </Link>
            )}
            {contact && (
              <a
                href={contact.href}
                {...(contact.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                aria-label={contact.label}
                className={`${btn("primary", "sm")} w-8 px-0 sm:w-auto sm:px-3`}
              >
                <contact.icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{contact.label}</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className={`${container} grid items-center gap-12 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-24 lg:pb-24`}>
          <div>
            <p className={`${devanagari.className} text-lg text-gold`} lang="hi">
              {shop.nameLocal}
            </p>
            <h1 className="mt-4 text-[2.6rem] leading-[1.06] text-fg sm:text-6xl lg:text-[4.25rem]">
              Gold &amp; silver, made for the moments that matter.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-fg-3">
              Hallmarked gold, everyday silver, and pieces made to your own design. Come in, try them on, and take your time.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#collections" className={`${btn("primary")} h-11 px-5`}>
                See the collections
                <ArrowRight className="h-4 w-4" />
              </a>
              {contact ? (
                <a
                  href={contact.href}
                  {...(contact.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={`${btn("secondary")} h-11 px-5`}
                >
                  <contact.icon className="h-4 w-4" />
                  {contact.label}
                </a>
              ) : (
                <a href="#made-to-order" className={`${btn("secondary")} h-11 px-5`}>
                  Get a piece made
                </a>
              )}
            </div>

            <ul className="mt-12 grid max-w-sm grid-cols-2 gap-x-6 gap-y-3">
              {promises.map((p) => (
                <li key={p.label} className="flex items-center gap-2 text-sm text-fg-2">
                  <p.icon className="h-4 w-4 text-gold" strokeWidth={1.6} />
                  {p.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[30rem] overflow-hidden rounded-[2rem] bg-gold-soft">
            <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full text-gold" aria-hidden>
              {[60, 110, 160, 210, 260].map((r) => (
                <circle key={r} cx="200" cy="215" r={r} fill="none" stroke="currentColor" strokeOpacity="0.14" />
              ))}
            </svg>
            <Necklace className="absolute inset-x-[8%] top-0 h-[90%] w-[84%]" />
          </div>
        </section>

        {/* Collections */}
        <section id="collections" className="scroll-mt-16 border-t border-line py-20 sm:py-24">
          <div className={container}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className={eyebrow}>Collections</p>
                <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight text-fg sm:text-4xl">Something for every day, and every occasion</h2>
              </div>
              <p className="max-w-sm text-fg-3">Visit the shop to see and try the full range. Our design gallery is coming online soon.</p>
            </div>

            <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {collections.map((c) => (
                <li key={c.kind} className="group overflow-hidden rounded-2xl border border-line bg-card shadow-card">
                  <div className="relative grid aspect-4/3 place-items-center bg-gold-soft sm:aspect-16/10">
                    <svg viewBox="0 0 320 200" className="absolute inset-0 h-full w-full text-gold" preserveAspectRatio="xMidYMid slice" aria-hidden>
                      {[46, 76, 106].map((r) => (
                        <circle key={r} cx="160" cy="100" r={r} fill="none" stroke="currentColor" strokeOpacity="0.13" />
                      ))}
                    </svg>
                    <CategoryArt kind={c.kind} className="relative h-16 w-16 text-gold transition-transform duration-500 group-hover:scale-105 sm:h-24 sm:w-24" />
                  </div>
                  <div className="p-3.5 sm:p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-serif text-[1.0625rem] leading-snug font-medium text-fg sm:text-xl">{c.name}</h3>
                      <span className="hidden text-xs text-fg-3 sm:inline">{c.metals.join(" · ")}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug text-fg-3 sm:mt-1.5 sm:text-sm">{c.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Made to order */}
        <section id="made-to-order" className="scroll-mt-16 bg-primary py-20 text-primary-fg sm:py-24">
          <div className={`${container} grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-16`}>
            <div>
              <p className={`${eyebrowBase} text-gold-soft opacity-80`}>Made to order</p>
              <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-4xl">Have a design in mind? We&apos;ll make it.</h2>
              <p className="mt-5 max-w-md leading-relaxed opacity-75">
                From a ring in a size we don&apos;t have in stock to a set copied from a family photo, we get pieces made to order in gold and silver.
              </p>
              {contact && (
                <a
                  href={contact.href}
                  {...(contact.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="mt-8 inline-flex h-11 items-center gap-2 rounded-ctl bg-primary-fg px-5 text-sm font-medium text-primary transition-opacity hover:opacity-90"
                >
                  <contact.icon className="h-4 w-4" />
                  {contact.label}
                </a>
              )}
            </div>

            <ol className="grid gap-px overflow-hidden rounded-2xl bg-primary-fg/15 sm:grid-cols-3">
              {orderSteps.map((s, i) => (
                <li key={s.title} className="bg-primary p-6">
                  <span className="font-serif text-4xl text-gold-soft opacity-80">{i + 1}</span>
                  <h3 className="mt-4 font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed opacity-70">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-16 py-20 sm:py-24">
          <div className={container}>
            <p className={eyebrow}>Services</p>
            <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight text-fg sm:text-4xl">Care for the jewellery you already own</h2>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {services.map((s) => (
                <div key={s.title} className="flex gap-5 rounded-2xl border border-line bg-card p-6 shadow-card sm:p-7">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold-soft text-gold">
                    <s.icon className="h-5 w-5" strokeWidth={1.6} />
                  </span>
                  <div>
                    <h3 className="font-serif text-xl font-medium text-fg">{s.title}</h3>
                    <p className="mt-2 leading-relaxed text-fg-3">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Visit: shown once the shop's address, hours or phone are filled in lib/shop.ts */}
        {hasVisit && (
          <section id="visit" className="scroll-mt-16 border-t border-line py-20 sm:py-24">
            <div className={`${container} grid gap-10 lg:grid-cols-2 lg:gap-16`}>
              <div>
                <p className={eyebrow}>Visit us</p>
                <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight text-fg sm:text-4xl">Come in and see the pieces in person</h2>
                <p className="mt-5 max-w-md leading-relaxed text-fg-3">
                  Jewellery is best chosen in the hand. Drop in, and we will bring out whatever you would like to see.
                </p>
              </div>

              <dl className="divide-y divide-line rounded-2xl border border-line bg-card shadow-card">
                {shop.address && (
                  <div className="flex gap-4 p-6">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.6} />
                    <div>
                      <dt className="text-sm font-medium text-fg">Address</dt>
                      <dd className="mt-1 text-fg-3">
                        {shop.address.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                        {shop.mapUrl && (
                          <a
                            href={shop.mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                          >
                            Open in Google Maps
                            <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </dd>
                    </div>
                  </div>
                )}
                {shop.hours && (
                  <div className="flex gap-4 p-6">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.6} />
                    <div className="flex-1">
                      <dt className="text-sm font-medium text-fg">Opening hours</dt>
                      <dd className="mt-1 space-y-0.5 text-fg-3">
                        {shop.hours.map((h) => (
                          <span key={h.days} className="flex justify-between gap-6">
                            <span>{h.days}</span>
                            <span className="text-fg-2">{h.time}</span>
                          </span>
                        ))}
                      </dd>
                    </div>
                  </div>
                )}
                {shop.phone && (
                  <div className="flex gap-4 p-6">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.6} />
                    <div>
                      <dt className="text-sm font-medium text-fg">Phone</dt>
                      <dd className="mt-1">
                        <a href={telHref(shop.phone)} className="text-fg-2 hover:text-fg">
                          {shop.phone}
                        </a>
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-line bg-sidebar">
        <div className={`${container} flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <div className="flex items-center gap-2.5">
              <Gem className="h-4 w-4 text-gold" strokeWidth={1.6} />
              <span className="font-serif text-base font-medium text-fg">{shop.name}</span>
            </div>
            <p className="mt-2 text-sm text-fg-4">© {new Date().getFullYear()} {shop.name}. Gold &amp; silver jewellery.</p>
          </div>
          <Link href="/login" className="text-sm text-fg-3 underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg">
            Staff login
          </Link>
        </div>
      </footer>
    </div>
  );
}
