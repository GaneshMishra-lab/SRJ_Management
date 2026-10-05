import Link from "next/link";
import { Plus } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemSaleBill } from "@/db/schema/sales";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, inr } from "@/lib/format";
import { tableWrapClass, theadClass } from "@/lib/styles";

export default async function SalesPage() {
  await getCurrentUser();

  const sales = await db
    .select({
      id: itemSaleBill.id,
      date: itemSaleBill.date,
      totalAmt: itemSaleBill.totalAmt,
      paidAmt: itemSaleBill.paidAmt,
      cancelledAt: itemSaleBill.cancelledAt,
      customerName: entity.name,
    })
    .from(itemSaleBill)
    .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
    .orderBy(desc(itemSaleBill.date), desc(itemSaleBill.createdAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Sales</h1>
          <p className="text-zinc-400 mt-1">Customer bills and what is still due on them.</p>
        </div>
        <Link
          href="/sales/new"
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Sale
        </Link>
      </div>

      <div className={tableWrapClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className={theadClass}>
              <tr>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Date</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Customer</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Bill Total</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Paid</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Due</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 sm:px-6 text-center text-zinc-500">
                    No sales yet. Click &quot;New Sale&quot; to add one.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => {
                  const cancelled = !!sale.cancelledAt;
                  const due = cancelled ? 0 : (sale.totalAmt ?? 0) - (sale.paidAmt ?? 0);
                  return (
                    <tr key={sale.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <Link href={`/sales/${sale.id}`} className="text-amber-500 hover:text-amber-400">
                          {dateOnly(sale.date)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-zinc-200">{sale.customerName || "Unknown"}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(sale.totalAmt)}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(sale.paidAmt)}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">{inr(due)}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          cancelled
                            ? "bg-red-500/10 text-red-400"
                            : due <= 0
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-amber-500/10 text-amber-500"
                        }`}>
                          {cancelled ? "Cancelled" : due <= 0 ? "Paid" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
