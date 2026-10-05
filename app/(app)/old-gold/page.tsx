import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { oldItem } from "@/db/schema/sales";
import { buyOldItem } from "@/app/actions/oldgold";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, EntityFields, Grams, linkClass, ModeField, PageHeader, Percent, Rupees, SelectField, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { dateOnly, grams, inr } from "@/lib/format";

const oldItemSource = (item: { saleBill: string | null; order: string | null; goldLoan: string | null }) =>
  item.saleBill ? "Exchange on sale" : item.order ? "Advance on order" : item.goldLoan ? "Defaulted pledge" : "Bought";

export default async function OldGoldPage() {
  await getCurrentUser();

  const customers = await listEntities(["customer"]);
  const items = await db
    .select({ item: oldItem, customerName: entity.name })
    .from(oldItem)
    .leftJoin(entity, eq(oldItem.customer, entity.id))
    .orderBy(desc(oldItem.date), desc(oldItem.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Old Gold" subtitle="Old metal bought, exchanged or taken over, and what became of it." />

      <Card title="Buy old metal" hint="For old metal given against a sale, add it on the sale bill instead.">
        <ActionForm action={buyOldItem} submitLabel="Record old metal">
          <EntityFields label="Customer" entities={customers} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <SelectField label="Metal" name="metal" options={["Gold", "Silver", "Phuli"]} />
            <Grams label="Weight (g)" name="weight" required />
            <Percent label="Melting (%)" name="melting" min="0.001" required />
            <Rupees label="Agreed value (₹)" name="amt" required />
            <Rupees label="Paid now (₹)" name="paid" min="0" />
            <ModeField label="Paid from" />
          </div>
          <DateField />
        </ActionForm>
      </Card>

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
