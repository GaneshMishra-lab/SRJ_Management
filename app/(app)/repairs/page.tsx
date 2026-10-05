import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemRepairing } from "@/db/schema/sales";
import { createRepair } from "@/app/actions/repairs";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, EntityFields, Field, Grams, linkClass, PageHeader, Rupees, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { dateOnly, grams, inr } from "@/lib/format";

export default async function RepairsPage() {
  await getCurrentUser();

  const customers = await listEntities(["customer"]);
  const repairs = await db
    .select({ repair: itemRepairing, customerName: entity.name })
    .from(itemRepairing)
    .leftJoin(entity, eq(itemRepairing.customer, entity.id))
    .orderBy(desc(itemRepairing.receivedDate), desc(itemRepairing.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Repairs" subtitle="Customer items taken in for repair, with weights recorded both ways." />

      <Card title="Take in a repair">
        <ActionForm action={createRepair} submitLabel="Take in">
          <EntityFields label="Customer" entities={customers} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><Field label="Item and what to repair" name="desc" type="text" placeholder="e.g. Gold chain, broken clasp" required /></div>
            <Grams label="Weight received (g)" name="receivedWeight" required />
            <Rupees label="Estimated charge (₹)" name="amt" min="0" />
          </div>
          <DateField />
        </ActionForm>
      </Card>

      <DataTable
        head={["Received", "Customer", "Item", "Weight in", "Charge", "Due", "Status"]}
        right={[3, 4, 5]}
        empty="No repairs yet."
        rows={repairs.map(({ repair, customerName }) => [
          <Link key="d" href={`/repairs/${repair.id}`} className={linkClass}>{dateOnly(repair.receivedDate)}</Link>,
          <span key="c" className="font-medium text-zinc-200">{customerName ?? "Unknown"}</span>,
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
