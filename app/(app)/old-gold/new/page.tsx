import { buyOldItem } from "@/app/actions/oldgold";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, EntityFields, Grams, ModeField, PageHeader, Percent, Rupees, SelectField } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";

export default async function BuyOldMetalPage() {
  await getCurrentUser();

  const customers = await listEntities(["customer"]);

  return (
    <div className="space-y-6">
      <PageHeader title="Buy old metal" subtitle="Old metal bought outright from a customer." back={{ href: "/old-gold", label: "Old Gold" }} />

      <Card title="Old metal" hint="For old metal given against a sale, add it on the sale bill instead.">
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
    </div>
  );
}
