import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { SaleForm } from "@/components/SaleForm";
import { saleEditData } from "@/lib/bill-forms";
import { requireOwner } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly } from "@/lib/format";

// Correct a saved sale bill in place. Owner only: it changes the day book of the bill's day.
export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await saleEditData(id);
  if (!data) notFound();
  const { bill, customers, pieces, loose, orders, bcs, held, rates, initial } = data;
  const back = { href: `/sales/${id}`, label: "Bill" };

  if (bill.cancelledAt) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit bill" back={back} />
        <Notice tone="bad">This bill was cancelled on {dateOnly(bill.cancelledAt)}, so it cannot be edited.</Notice>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Edit bill" subtitle={`Sale bill of ${dateOnly(bill.date)}`} back={back} />
      <SaleForm
        edit={{ id, initial }}
        customers={customers}
        pieces={pieces}
        loose={loose}
        rates={{ Gold: rates.Gold?.rate ?? null, Silver: rates.Silver?.rate ?? null }}
        orders={orders}
        bcs={bcs}
        held={held}
      />
    </div>
  );
}
