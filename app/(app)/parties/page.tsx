import { asc } from "drizzle-orm";
import { db } from "@/db";
import { entityBalance } from "@/db/schema/finance";
import { DataTable, PageHeader, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { inr } from "@/lib/format";
import { round2 } from "@/lib/pricing";

export default async function PartiesPage() {
  await getCurrentUser();

  const rows = (await db.select().from(entityBalance).orderBy(asc(entityBalance.name))).map((row) => {
    const owesShop = round2((row.saleDue ?? 0) + (row.repairDue ?? 0) + (row.loanDue ?? 0) + (row.goldLoanPrincipalDue ?? 0) + (row.supplierReturnDue ?? 0));
    const shopOwes = round2((row.billDue ?? 0) + (row.lendDue ?? 0) + (row.oldItemDue ?? 0));
    return { ...row, owesShop, shopOwes };
  });

  const parts = (items: [string, number | null][]) =>
    items.filter(([, amt]) => (amt ?? 0) !== 0).map(([name, amt]) => `${name} ${inr(amt)}`).join(" · ") || "-";

  return (
    <div className="space-y-6">
      <PageHeader title="Parties" subtitle="What each customer, supplier and staff member owes the shop, and what the shop owes them. Gold loan interest is not included." />

      <Stats items={[
        { name: "Owed to the shop", value: inr(rows.reduce((sum, row) => sum + row.owesShop, 0)) },
        { name: "Owed by the shop", value: inr(rows.reduce((sum, row) => sum + row.shopOwes, 0)) },
      ]} />

      <DataTable
        head={["Name", "Type", "Owes the shop", "Made up of", "Shop owes", "Made up of"]}
        right={[2, 4]}
        empty="No parties yet."
        rows={rows.map((row) => [
          <span key="n" className="font-medium text-zinc-200">{row.name}</span>,
          <StatusBadge key="t" tone="zinc">{row.type}</StatusBadge>,
          <span key="o" className={row.owesShop > 0 ? "text-emerald-400" : ""}>{inr(row.owesShop)}</span>,
          parts([["Sales", row.saleDue], ["Repairs", row.repairDue], ["Loans", row.loanDue], ["Gold loans", row.goldLoanPrincipalDue], ["Returns", row.supplierReturnDue]]),
          <span key="s" className={row.shopOwes > 0 ? "text-red-400" : ""}>{inr(row.shopOwes)}</span>,
          parts([["Bills", row.billDue], ["Borrowed", row.lendDue], ["Old metal", row.oldItemDue]]),
        ])}
      />
    </div>
  );
}
