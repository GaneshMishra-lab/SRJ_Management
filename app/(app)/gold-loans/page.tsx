import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { goldLoan } from "@/db/schema/sales";
import { createGoldLoan } from "@/app/actions/goldloans";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, EntityFields, Field, Grams, linkClass, ModeField, PageHeader, Percent, Rupees, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { dateOnly, grams, inr } from "@/lib/format";

export default async function GoldLoansPage() {
  await getCurrentUser();

  const customers = await listEntities(["customer"]);
  const loans = await db
    .select({ loan: goldLoan, customerName: entity.name })
    .from(goldLoan)
    .leftJoin(entity, eq(goldLoan.customer, entity.id))
    .orderBy(desc(goldLoan.date), desc(goldLoan.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Gold Loans" subtitle="Money lent against pledged ornaments (girvi), at simple monthly interest." />

      <Card title="Give a gold loan">
        <ActionForm action={createGoldLoan} submitLabel="Give loan">
          <EntityFields label="Customer" entities={customers} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><Field label="Items pledged" name="item" type="text" placeholder="e.g. 2 bangles, 1 chain" required /></div>
            <div className="col-span-2"><Field label="Notes (purity, marks)" name="desc" type="text" /></div>
            <Grams label="Total weight (g)" name="weight" required />
            <Rupees label="Loan amount (₹)" name="amt" required />
            <Percent label="Interest (% per month)" name="interest" required />
            <ModeField label="Paid from" />
          </div>
          <DateField />
        </ActionForm>
      </Card>

      <DataTable
        head={["Date", "Customer", "Pledge", "Weight", "Loan", "Principal due", "Interest", "Status"]}
        right={[3, 4, 5]}
        empty="No gold loans yet."
        rows={loans.map(({ loan, customerName }) => [
          <Link key="d" href={`/gold-loans/${loan.id}`} className={linkClass}>{dateOnly(loan.date)}</Link>,
          <span key="c" className="font-medium text-zinc-200">{customerName ?? "Unknown"}</span>,
          loan.item,
          grams(loan.weight),
          inr(loan.amt),
          inr((loan.amt ?? 0) - (loan.amtPaid ?? 0)),
          `${loan.interest ?? 0}% / month`,
          <StatusBadge key="s" tone={loan.status === "active" ? "amber" : loan.status === "closed" ? "emerald" : "red"}>{loan.status}</StatusBadge>,
        ])}
      />
    </div>
  );
}
