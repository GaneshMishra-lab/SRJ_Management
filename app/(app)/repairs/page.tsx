import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemRepairing } from "@/db/schema/sales";
import { DataTable, linkClass, PageHeader, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, grams, inr } from "@/lib/format";
import { btn } from "@/lib/styles";

export default async function RepairsPage() {
  await getCurrentUser();

  const repairs = await db
    .select({ repair: itemRepairing, customerName: entity.name })
    .from(itemRepairing)
    .leftJoin(entity, eq(itemRepairing.customer, entity.id))
    .orderBy(desc(itemRepairing.receivedDate), desc(itemRepairing.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Repairs" subtitle="Customer items taken in for repair, with weights recorded both ways.">
        <Link href="/repairs/new" className={btn()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Take in repair
        </Link>
      </PageHeader>

      <DataTable
        head={["Received", "Customer", "Item", "Weight in", "Charge", "Due", "Status"]}
        right={[3, 4, 5]}
        empty="No repairs yet."
        rows={repairs.map(({ repair, customerName }) => [
          <Link key="d" href={`/repairs/${repair.id}`} className={linkClass}>{dateOnly(repair.receivedDate)}</Link>,
          <span key="c" className="font-medium text-fg">{customerName ?? "Unknown"}</span>,
          repair.desc,
          grams(repair.receivedWeight),
          inr(repair.amt),
          inr((repair.amt ?? 0) - (repair.paidAmt ?? 0)),
          <StatusBadge key="s" tone={repair.status === "returned" ? "emerald" : repair.status === "repaired" ? "blue" : "amber"}>{repair.status}</StatusBadge>,
        ])}
      />
    </div>
  );
}
