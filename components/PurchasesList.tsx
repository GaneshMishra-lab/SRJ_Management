"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { matches, RowLink, SearchField } from "@/components/controls";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { inr } from "@/lib/format";
import { btn, rowClass, tableWrapClass, tdClass, thClass } from "@/lib/styles";

export type PurchaseRow = {
  id: string;
  date: string;
  supplier: string;
  metal: string | null;
  billAmt: number | null;
  paidAmt: number | null;
};

export function PurchasesList({ rows }: { rows: PurchaseRow[] }) {
  const [query, setQuery] = useState("");

  const listed = rows.map((row) => ({ ...row, status: (row.paidAmt ?? 0) >= (row.billAmt ?? 0) ? ("Paid" as const) : ("Pending" as const) }));
  const shown = listed.filter((row) => matches(query, row.date, row.supplier, row.metal, row.status, row.billAmt, row.paidAmt));
  const total = shown.reduce((sum, row) => sum + (row.billAmt ?? 0), 0);
  const due = shown.reduce((sum, row) => sum + Math.max(0, (row.billAmt ?? 0) - (row.paidAmt ?? 0)), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Purchases" subtitle="Supplier bills, newest first.">
        <SearchField value={query} onChange={setQuery} placeholder="Search purchases" />
        <Link href="/purchases/new" className={btn()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New purchase
        </Link>
      </PageHeader>

      <div className={tableWrapClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-fg-2">
            <thead>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Supplier</th>
                <th className={thClass}>Metal</th>
                <th className={`${thClass} text-right`}>Bill amount</th>
                <th className={`${thClass} text-right`}>Paid</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} w-10`} aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty>{query ? `No purchases match "${query}".` : "No purchases yet."}</Empty>
                  </td>
                </tr>
              ) : (
                shown.map((row) => (
                  <RowLink key={row.id} href={`/purchases/${row.id}`} className={rowClass}>
                    <td className={tdClass}>
                      <Link href={`/purchases/${row.id}`} className="font-medium text-fg">{row.date}</Link>
                    </td>
                    <td className={`${tdClass} text-fg`}>{row.supplier}</td>
                    <td className={tdClass}>{row.metal ?? "-"}</td>
                    <td className={`${tdClass} text-right tabular-nums text-fg`}>{inr(row.billAmt)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{inr(row.paidAmt)}</td>
                    <td className={tdClass}><StatusBadge tone={row.status === "Paid" ? "ok" : "warn"}>{row.status}</StatusBadge></td>
                    <td className="pr-4 text-fg-4"><ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" /></td>
                  </RowLink>
                ))
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-[13px] text-fg-3">
          <span>{shown.length} of {rows.length} bills</span>
          <span className="tabular-nums">{inr(total)} billed · {inr(due)} still to pay</span>
        </footer>
      </div>
    </div>
  );
}
