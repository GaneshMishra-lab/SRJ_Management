import { PageHeader } from "@/components/ui";
import { PurchaseForm } from "@/components/PurchaseForm";
import { purchaseFormData } from "@/lib/bill-forms";
import { getCurrentUser } from "@/lib/dal";

export default async function NewPurchasePage() {
  await getCurrentUser();

  const { suppliers, itemTypes, orders } = await purchaseFormData();

  return (
    <div className="space-y-6">
      <PageHeader title="New purchase" subtitle="An incoming bill from a supplier." back={{ href: "/purchases", label: "Purchases" }} />
      <PurchaseForm suppliers={suppliers} itemTypes={itemTypes} orders={orders} />
    </div>
  );
}
