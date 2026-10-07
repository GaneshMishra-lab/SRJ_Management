import { createOrder } from "@/app/actions/orders";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, EntityFields, Field, Grams, ModeField, PageHeader, Percent, Rupees, SelectField } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { inr } from "@/lib/format";
import { getCurrentRates } from "@/lib/ledger";

export default async function NewOrderPage() {
  await getCurrentUser();

  const customers = await listEntities(["customer"]);
  const rates = await getCurrentRates();

  return (
    <div className="space-y-6">
      <PageHeader title="New order" subtitle="A piece to be made to order." back={{ href: "/orders", label: "Orders" }} />

      <Card hint={`To book today's rate, enter it below (gold ${rates.Gold ? inr(rates.Gold.rate) : "not set"}, silver ${rates.Silver ? inr(rates.Silver.rate) : "not set"} per gram fine). Leave it empty to bill at the delivery day's rate.`} title="Order">
        <ActionForm action={createOrder} submitLabel="Save order">
          <EntityFields label="Customer" entities={customers} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><Field label="What is ordered" name="name" type="text" placeholder="e.g. 22k bangle pair" required /></div>
            <SelectField label="Metal" name="metal" options={["Gold", "Silver"]} />
            <Grams label="Approx. weight (g)" name="weight" min="0" />
            <Percent label="Melting (%)" name="melting" />
            <Rupees label="Estimate (₹)" name="amt" min="0" />
            <Rupees label="Booked rate (₹/g fine)" name="bookedRate" min="0" />
            <Rupees label="Advance (₹)" name="advance" min="0" />
            <ModeField label="Advance received in" />
          </div>
          <DateField />
        </ActionForm>
      </Card>
    </div>
  );
}
