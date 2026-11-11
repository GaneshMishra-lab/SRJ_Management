import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { oldItem } from "@/db/schema/sales";
import { DataTable, linkClass, PageHeader, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, grams, inr } from "@/lib/format";
import { btn } from "@/lib/styles";

const oldItemSource = (item: { saleBill: string | null; order: string | null; goldLoan: string | null }) =>
  item.saleBill ? "Exchange on sale" : item.order ? "Advance on order" : item.goldLoan ? "Defaulted pledge" : "Bought";

export default async function OldGoldPage() {
  await getCurrentUser();

  const items = await db
    .select({ item: oldItem, customerName: entity.name })
    .from(oldItem)
    .leftJoin(entity, eq(oldItem.customer, entity.id))
    .orderBy(desc(oldItem.date), desc(oldItem.createdAt))
    .limit(100);

  // What is still in the vault, per metal: its weight, its fine (weight × melting) and what it cost.
  const inVault = await db
    .select({
      metal: oldItem.metal,
      weight: sql<number>`coalesce(sum(${oldItem.weight}), 0)`.mapWith(Number),
      fine: sql<number>`coalesce(sum(${oldItem.weight} * coalesce(${oldItem.melting}, 0) / 100), 0)`.mapWith(Number),
      amt: sql<number>`coalesce(sum(${oldItem.amt}), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(oldItem)
    .where(eq(oldItem.status, "vault"))
    .groupBy(oldItem.metal);
  const total = (metal: string) => inVault.find((row) => row.metal === metal) ?? { weight: 0, fine: 0, amt: 0, count: 0 };

  return (
    <div className="space-y-6">
      <PageHeader title="Old Gold" subtitle="Old metal bought, exchanged or taken over, and what became of it.">
        <Link href="/old-gold/new" className={btn()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Buy old metal
        </Link>
      </PageHeader>

      <Stats items={([["Gold", "Old gold"], ["Silver", "Old silver"], ["Phuli", "Old phuli"]] as const).map(([metal, name]) => {
        const row = total(metal);
        return { name: `${name} in vault`, value: grams(row.weight), note: `${row.count} ${row.count === 1 ? "item" : "items"} · fine ${grams(row.fine)} · ${inr(row.amt)}` };
      })} />

      <DataTable
        head={["Date", "Customer", "Metal", "Weight", "Melting", "Value", "Owed", "Source", "Status"]}
        right={[3, 4, 5, 6]}
        empty="No old metal recorded yet."
        rows={items.map(({ item, customerName }) => [
          <Link key="d" href={`/old-gold/${item.id}`} className={linkClass}>{dateOnly(item.date)}</Link>,
          <span key="c" className="font-medium text-fg">{customerName ?? "Unknown"}</span>,
          item.metal,
          grams(item.weight),
          `${item.melting ?? 0}%`,
          inr(item.amt),
          inr((item.amt ?? 0) - (item.paidAmt ?? 0)),
          oldItemSource(item),
          <StatusBadge key="s" tone={item.status === "vault" ? "amber" : "zinc"}>{item.status}</StatusBadge>,
        ])}
      />
    </div>
  );
}
