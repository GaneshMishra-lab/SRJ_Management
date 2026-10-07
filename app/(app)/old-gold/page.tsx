import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { oldItem } from "@/db/schema/sales";
import { DataTable, linkClass, PageHeader, StatusBadge } from "@/components/ui";
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

  return (
    <div className="space-y-6">
      <PageHeader title="Old Gold" subtitle="Old metal bought, exchanged or taken over, and what became of it.">
        <Link href="/old-gold/new" className={btn()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Buy old metal
        </Link>
      </PageHeader>

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
