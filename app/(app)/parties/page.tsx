import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { entityBalance } from "@/db/schema/finance";
import { DataTable, PageHeader, Stats } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { inr } from "@/lib/format";
import { partyTotals } from "@/lib/parties";
import { btn, inputClass } from "@/lib/styles";

const TABS = [
  { value: "customer", label: "Customers", empty: "No customers yet." },
  { value: "supplier", label: "Suppliers", empty: "No suppliers yet." },
  { value: "staff", label: "Staff", empty: "No staff yet." },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await getCurrentUser();
  const params = await searchParams;
  const tab: Tab = TABS.find((t) => t.value === params.tab)?.value ?? "customer";
  const query = typeof params.q === "string" ? params.q.trim() : "";

  const [balances, contacts] = await Promise.all([
    db.select().from(entityBalance).orderBy(asc(entityBalance.name)),
    db.select({ id: entity.id, contact: entity.contact }).from(entity),
  ]);
  const phone = new Map(contacts.map((row) => [row.id, row.contact]));
  const all = balances.map((row) => ({ ...row, contact: phone.get(row.entity ?? "") ?? null, ...partyTotals(row) }));

  const counts = Object.fromEntries(TABS.map((t) => [t.value, all.filter((row) => row.type === t.value).length]));
  const needle = query.toLowerCase();
  const rows = all.filter((row) => row.type === tab && (!needle || `${row.name ?? ""} ${row.contact ?? ""}`.toLowerCase().includes(needle)));
  const current = TABS.find((t) => t.value === tab)!;

  const parts = (items: [string, number | null][]) =>
    items.filter(([, amt]) => (amt ?? 0) !== 0).map(([name, amt]) => `${name} ${inr(amt)}`).join(" · ") || "-";
  const tabHref = (value: Tab) => `/parties?tab=${value}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Parties" subtitle="Customers, suppliers and staff: who they are, what they owe the shop and what the shop owes them. Gold loan interest is not included.">
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" type="search" defaultValue={query} placeholder="Name or phone" aria-label="Search by name or phone" className={`${inputClass} w-48`} />
          <button type="submit" className={btn("secondary")}>Search</button>
        </form>
      </PageHeader>

      {/* Tabs are links, so each list has its own address and the back button returns to it. */}
      <nav aria-label="Kind of party" className="inline-flex h-10 items-stretch rounded-ctl bg-fg/6 p-[3px]">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref(t.value)}
            aria-current={t.value === tab ? "page" : undefined}
            className={`inline-flex items-center justify-center gap-1.5 rounded-[0.45rem] px-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
              t.value === tab ? "bg-card text-fg shadow-card" : "text-fg-3 hover:text-fg"
            }`}
          >
            {t.label} <span className="text-fg-4 tabular-nums">{counts[t.value]}</span>
          </Link>
        ))}
      </nav>

      <Stats items={[
        { name: `${current.label} owe the shop`, value: inr(rows.reduce((sum, row) => sum + row.owesShop, 0)) },
        { name: `Shop owes ${current.label.toLowerCase()}`, value: inr(rows.reduce((sum, row) => sum + row.shopOwes, 0)) },
      ]} />

      <DataTable
        head={["Name", "Phone", "Owes the shop", "Made up of", "Shop owes", "Made up of"]}
        right={[2, 4]}
        empty={query ? `No ${current.label.toLowerCase()} match “${query}”.` : current.empty}
        rows={rows.map((row) => [
          <Link key="n" href={`/parties/${row.entity}`}>{row.name ?? "Unknown"}</Link>,
          row.contact || "-",
          <span key="o" className={row.owesShop > 0 ? "text-ok" : ""}>{inr(row.owesShop)}</span>,
          parts([["Sales", row.saleDue], ["Repairs", row.repairDue], ["Loans", row.loanDue], ["Gold loans", row.goldLoanPrincipalDue], ["Returns", row.supplierReturnDue]]),
          <span key="s" className={row.shopOwes > 0 ? "text-bad" : ""}>{inr(row.shopOwes)}</span>,
          parts([["Bills", row.billDue], ["Borrowed", row.lendDue], ["Old metal", row.oldItemDue]]),
        ])}
      />
    </div>
  );
}
