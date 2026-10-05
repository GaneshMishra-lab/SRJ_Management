import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemRepairing, itemRepairingPayment } from "@/db/schema/sales";
import { addRepairPayment, markRepaired, returnRepair, sendRepair } from "@/app/actions/repairs";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, EntityFields, Grams, ModeField, PageHeader, Rupees, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { isUuid } from "@/lib/form";
import { dateTime, grams, inr } from "@/lib/format";
import { round2 } from "@/lib/pricing";

export default async function RepairPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const karigar = alias(entity, "karigar");
  const [row] = await db
    .select({ repair: itemRepairing, customerName: entity.name, karigarName: karigar.name })
    .from(itemRepairing)
    .leftJoin(entity, eq(itemRepairing.customer, entity.id))
    .leftJoin(karigar, eq(itemRepairing.karigar, karigar.id))
    .where(eq(itemRepairing.id, id));
  if (!row) notFound();

  const { repair } = row;
  const payments = await db.select().from(itemRepairingPayment).where(eq(itemRepairingPayment.repair, id)).orderBy(asc(itemRepairingPayment.date));
  const karigars = await listEntities(["supplier"]);
  const due = round2((repair.amt ?? 0) - (repair.paidAmt ?? 0));
  const weightDiff = repair.returnedWeight != null ? (repair.returnedWeight ?? 0) - (repair.receivedWeight ?? 0) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/repairs", label: "Repairs" }}
        title={<>{repair.desc} <StatusBadge tone={repair.status === "returned" ? "emerald" : "amber"}>{repair.status}</StatusBadge></>}
        subtitle={row.customerName ?? "Unknown customer"}
      />

      <Stats items={[
        { name: "Weight received", value: grams(repair.receivedWeight) },
        { name: "Weight returned", value: repair.returnedWeight != null ? grams(repair.returnedWeight) : "-" },
        { name: "Charge", value: inr(repair.amt) },
        { name: "Still due", value: inr(due) },
      ]} />

      <Card title="Life cycle">
        <ul className="space-y-2 text-sm text-zinc-300">
          <li>{dateTime(repair.receivedDate)} · taken in at {grams(repair.receivedWeight)}</li>
          {repair.sentDate && <li>{dateTime(repair.sentDate)} · sent to {row.karigarName ?? "karigar"}</li>}
          {repair.doneDate && <li>{dateTime(repair.doneDate)} · repaired, charge {inr(repair.amt)}</li>}
          {repair.returnedDate && (
            <li>
              {dateTime(repair.returnedDate)} · returned to customer at {grams(repair.returnedWeight)}
              {weightDiff !== null && weightDiff !== 0 && <span className="text-amber-500"> ({weightDiff > 0 ? "+" : ""}{weightDiff.toFixed(3)} g against received)</span>}
            </li>
          )}
          {payments.map((payment) => (
            <li key={payment.id} className="text-zinc-400">{dateTime(payment.date)} · received {inr(payment.amt)} by {payment.mode}</li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {repair.status === "taken" && (
          <Card title="Send for repair">
            <ActionForm action={sendRepair.bind(null, id)} submitLabel="Send out">
              <EntityFields label="Karigar" entities={karigars} newLabel="Or a new karigar" />
              <DateField />
            </ActionForm>
          </Card>
        )}

        {(repair.status === "taken" || repair.status === "sent for repair") && (
          <Card title="Repair done" hint={repair.status === "taken" ? "Use this directly if it was repaired in the shop." : "The item is back at the shop."}>
            <ActionForm action={markRepaired.bind(null, id)} submitLabel="Mark as repaired">
              <Rupees label="Charge to customer (₹)" name="amt" min="0" defaultValue={repair.amt ?? undefined} required />
              <DateField />
            </ActionForm>
          </Card>
        )}

        {repair.status === "repaired" && (
          <Card title="Return to customer" hint="Weigh it in front of the customer.">
            <ActionForm action={returnRepair.bind(null, id)} submitLabel="Hand back">
              <Grams label="Weight returned (g)" name="returnedWeight" defaultValue={repair.receivedWeight ?? undefined} required />
              <DateField />
            </ActionForm>
          </Card>
        )}

        {due > 0 && (repair.status === "repaired" || repair.status === "returned") && (
          <Card title="Receive payment">
            <ActionForm action={addRepairPayment.bind(null, id)} submitLabel="Record payment">
              <Rupees label="Amount (₹)" name="amt" max={due} required />
              <ModeField label="Received in" />
              <DateField />
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
