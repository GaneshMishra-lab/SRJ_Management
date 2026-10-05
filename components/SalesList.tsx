"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { matches, RowLink, SearchField, Segmented } from "@/components/controls";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { grams, inr } from "@/lib/format";
import { btn, rowClass, tableWrapClass, tdClass, thClass } from "@/lib/styles";

type Metal = "Gold" | "Silver";

// One row per piece sold; status is that of the bill the piece is on.
export type SaleRow = {
  id: string;
  billId: string;
  date: string;
  item: string;
  metal: string | null;
  weight: number | null;
  amt: number | null;
  customer: string;
  status: "Paid" | "Pending" | "Cancelled";
};

const tones = { Paid: "ok", Pending: "warn", Cancelled: "bad" } as const;

export function SalesList({ rows }: { rows: SaleRow[] }) {
  const [metal, setMetal] = useState<Metal>("Gold");
  const [query, setQuery] = useState("");

  const ofMetal = rows.filter((row) => row.metal === metal);
  const shown = ofMetal.filter((row) => matches(query, row.date, row.item, row.customer, row.status, row.weight, row.amt));
  const counted = shown.filter((row) => row.status !== "Cancelled");
  const weight = counted.reduce((sum, row) => sum + (row.weight ?? 0), 0);
  const amount = counted.reduce((sum, row) => sum + (row.amt ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Sales" subtitle="Pieces sold, newest first.">
        <Segmented label="Metal" value={metal} onChange={setMetal} options={[{ value: "Gold", label: "Gold" }, { value: "Silver", label: "Silver" }]} />
        <SearchField value={query} onChange={setQuery} placeholder="Search sales" />
        <Link href="/sales/new" className={btn()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New sale
        </Link>
      </PageHeader>

      <div className={tableWrapClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-fg-2">
            <thead>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Item</th>
                <th className={thClass}>Customer</th>
                <th className={`${thClass} text-right`}>Weight</th>
                <th className={`${thClass} text-right`}>Amount</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} w-10`} aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty>{query ? `No ${metal.toLowerCase()} sales match "${query}".` : `No ${metal.toLowerCase()} sales yet.`}</Empty>
                  </td>
                </tr>
              ) : (
                shown.map((row) => (
                  <RowLink key={row.id} href={`/sales/${row.billId}`} className={rowClass}>
                    <td className={tdClass}>
                      <Link href={`/sales/${row.billId}`} className="font-medium text-fg">{row.date}</Link>
                    </td>
                    <td className={`${tdClass} text-fg`}>{row.item}</td>
                    <td className={tdClass}>{row.customer}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{grams(row.weight)}</td>
                    <td className={`${tdClass} text-right tabular-nums ${row.status === "Cancelled" ? "text-fg-4 line-through" : "text-fg"}`}>{inr(row.amt)}</td>
                    <td className={tdClass}><StatusBadge tone={tones[row.status]}>{row.status}</StatusBadge></td>
                    <td className="pr-4 text-fg-4"><ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" /></td>
                  </RowLink>
                ))
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-[13px] text-fg-3">
          <span>{shown.length} of {ofMetal.length} {metal.toLowerCase()} pieces</span>
          <span className="tabular-nums">
            {grams(weight)} · {inr(amount)}{counted.length < shown.length ? " · cancelled not counted" : ""}
          </span>
        </footer>
      </div>
    </div>
  );
}
