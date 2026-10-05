import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { bill } from "@/db/schema/sales";
import { entity } from "@/db/schema/entities";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, inr } from "@/lib/format";

export default async function PurchasesPage() {
  await getCurrentUser();

  // Fetch purchases
  const purchases = await db
    .select({
      id: bill.id,
      date: bill.date,
      billAmt: bill.billAmt,
      paidAmt: bill.paidAmt,
      supplierName: entity.name,
    })
    .from(bill)
    .leftJoin(entity, eq(bill.supplier, entity.id))
    .orderBy(desc(bill.date), desc(bill.createdAt))
    .limit(20);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Purchases</h1>
          <p className="text-zinc-400 mt-1">Manage your incoming stock and supplier bills.</p>
        </div>
        <Link 
          href="/purchases/new"
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Purchase
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Date</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Supplier</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Bill Amount</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Paid Amount</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 sm:px-6 text-center text-zinc-500">
                    No purchases found. Click &quot;New Purchase&quot; to add one.
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => {
                  const isPaid = (purchase.paidAmt ?? 0) >= (purchase.billAmt ?? 0);
                  return (
                    <tr key={purchase.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <Link href={`/purchases/${purchase.id}`} className="text-amber-500 hover:text-amber-400">
                          {dateOnly(purchase.date)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-zinc-200">
                        {purchase.supplierName || "Unknown"}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(purchase.billAmt)}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(purchase.paidAmt)}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          isPaid 
                            ? "bg-emerald-500/10 text-emerald-500" 
                            : "bg-amber-500/10 text-amber-500"
                        }`}>
                          {isPaid ? "Paid" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
