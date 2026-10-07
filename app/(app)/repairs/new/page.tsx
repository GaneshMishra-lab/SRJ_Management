import { createRepair } from "@/app/actions/repairs";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, EntityFields, Field, Grams, PageHeader, Rupees } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";

export default async function NewRepairPage() {
  await getCurrentUser();

  const customers = await listEntities(["customer"]);

  return (
    <div className="space-y-6">
      <PageHeader title="Take in a repair" subtitle="A customer's item, with the weight it came in at." back={{ href: "/repairs", label: "Repairs" }} />

      <Card title="Repair">
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
    </div>
  );
}
