"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, PackageOpen, ChevronRight, Tag } from "lucide-react";
import { btn, labelClass, rowClass, stockStatus, tableWrapClass, tdClass, thClass } from "@/lib/styles";
import { dateOnly, grams } from "@/lib/format";
import { createItemType } from "@/app/actions/purchases";
import { RowLink, Segmented } from "@/components/controls";
import { Card, Empty, Field, PageHeader, StatusBadge } from "@/components/ui";

type ItemType = { id: string; name: string; metal: string | null };
type StockItem = {
  id: string;
  date: string | null;
  status: string | null;
  label: number | null;
  itemTypeId: string | null;
  typeName: string | null;
  metal: string | null;
  weight: number | null;
  isNew: boolean;
};

export function InventoryManager({
  itemTypes,
  inventory,
  toLabel,
}: {
  itemTypes: ItemType[];
  inventory: StockItem[];
  toLabel: number;
}) {
  // Only one metal is listed at a time.
  const [metal, setMetal] = useState<"Gold" | "Silver">("Gold");
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newItemTypeName, setNewItemTypeName] = useState("");
  const [newItemTypeMetal, setNewItemTypeMetal] = useState("Gold");
  const [loading, setLoading] = useState(false);

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await createItemType(newItemTypeName, newItemTypeMetal);
    setLoading(false);
    if (res.success) {
      setIsModalOpen(false);
      setNewItemTypeName("");
      // It will auto-revalidate because of revalidatePath in the action
    } else {
      alert(res.error);
    }
  };

  const getStockForType = (typeId: string) => {
    return inventory.filter((item) => item.itemTypeId === typeId);
  };
  const shownTypes = itemTypes.filter((type) => type.metal === metal);
  const pieces = (m: string) => inventory.filter((item) => item.metal === m).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" subtitle="Pieces in the shop, by item type.">
        <Segmented
          label="Metal"
          value={metal}
          onChange={(next) => { setMetal(next); setExpandedTypeId(null); }}
          options={[
            { value: "Gold", label: `Gold · ${pieces("Gold")}` },
            { value: "Silver", label: `Silver · ${pieces("Silver")}` },
          ]}
        />
        {toLabel > 0 && (
          <Link href="/inventory/label" className={btn("secondary")}>
            <Tag className="h-4 w-4" aria-hidden="true" />
            To label · {toLabel}
          </Link>
        )}
        <button type="button" onClick={() => { setNewItemTypeMetal(metal); setIsModalOpen(true); }} className={btn()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New item type
        </button>
      </PageHeader>

      {shownTypes.length === 0 ? (
        <Card>
          <Empty icon={<PackageOpen className="h-5 w-5" />}>No {metal.toLowerCase()} item types yet. Create one to get started.</Empty>
        </Card>
      ) : (
        <div className={tableWrapClass}>
          {shownTypes.map((type) => {
            const typeStock = getStockForType(type.id);
            const isExpanded = expandedTypeId === type.id;
            const weight = typeStock.reduce((sum, item) => sum + (item.weight ?? 0), 0);

            return (
              <div key={type.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => setExpandedTypeId(isExpanded ? null : type.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-fg/3"
                >
                  <ChevronRight className={`h-4 w-4 shrink-0 text-fg-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-fg">{type.name}</span>
                  <span className="text-sm text-fg-3 tabular-nums">{grams(weight)}</span>
                  <span className="w-24 text-right text-sm text-fg-2 tabular-nums">{typeStock.length} {typeStock.length === 1 ? "piece" : "pieces"}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-line bg-page/70">
                    {typeStock.length === 0 ? (
                      <p className="px-5 py-8 text-center text-sm text-fg-3">No pieces of this type in stock.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-fg-2">
                          <thead>
                            <tr>
                              <th className={`${thClass} pl-12`}>Label</th>
                              <th className={thClass}>Added</th>
                              <th className={thClass}>Source</th>
                              <th className={`${thClass} text-right`}>Weight</th>
                              <th className={thClass}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {typeStock.map((item) => (
                              <RowLink key={item.id} href={`/inventory/${item.id}`} className={rowClass}>
                                <td className={`${tdClass} pl-12`}>
                                  <Link href={`/inventory/${item.id}`} className="font-medium text-fg">#{item.label ?? "-"}</Link>
                                </td>
                                <td className={tdClass}>{dateOnly(item.date)}</td>
                                <td className={tdClass}>{item.isNew ? "New stock" : "Refurbished"}</td>
                                <td className={`${tdClass} text-right tabular-nums`}>{grams(item.weight)}</td>
                                <td className={tdClass}>
                                  <StatusBadge tone={stockStatus[item.status ?? ""]?.tone ?? "neutral"}>{stockStatus[item.status ?? ""]?.label ?? item.status}</StatusBadge>
                                </td>
                              </RowLink>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={(event) => event.target === event.currentTarget && setIsModalOpen(false)}
          onKeyDown={(event) => event.key === "Escape" && setIsModalOpen(false)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="new-type-title" className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-pop">
            <h2 id="new-type-title" className="font-serif text-[1.375rem] font-medium text-fg">New item type</h2>
            <p className="mt-1 text-[13px] text-fg-3">Pieces are grouped and labelled by their type.</p>
            <form onSubmit={handleCreateType} className="mt-5 space-y-4">
              <Field
                label="Name"
                type="text"
                value={newItemTypeName}
                onChange={(e) => setNewItemTypeName(e.target.value)}
                placeholder="e.g. Ring"
                autoFocus
                required
              />
              <div className="space-y-1.5">
                <span className={labelClass}>Metal</span>
                <Segmented
                  label="Metal"
                  className="w-full"
                  value={newItemTypeMetal}
                  onChange={setNewItemTypeMetal}
                  options={[{ value: "Gold", label: "Gold" }, { value: "Silver", label: "Silver" }]}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className={btn("secondary")}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} className={btn()}>
                  {loading ? "Saving..." : "Create type"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
