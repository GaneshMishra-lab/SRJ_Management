"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, PackageOpen, ChevronRight, Tag } from "lucide-react";
import { btn, labelClass, rowClass, stockStatus, tableWrapClass, tdClass, thClass } from "@/lib/styles";
import { dateOnly, grams } from "@/lib/format";
import { createItemType } from "@/app/actions/purchases";
import { RowLink, Segmented } from "@/components/controls";
import { Card, DataTable, Empty, Field, PageHeader, StatusBadge } from "@/components/ui";

type ItemType = { id: string; name: string; metal: string | null; loose: boolean; piecesPerGram: number | null };
// Loose metal (mani) on hand: one row per type and melting.
type LooseStock = { itemTypeId: string; melting: number; weight: number };
type MiscStock = { id: string; name: string | null; unit: string | null; categoryName: string | null; inHand: number };
type View = "pieces" | "loose" | "misc";
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
  loose,
  misc,
  toLabel,
}: {
  itemTypes: ItemType[];
  inventory: StockItem[];
  loose: LooseStock[];
  misc: MiscStock[];
  toLabel: number;
}) {
  // The shop's three kinds of stock: labelled pieces, loose metal kept by weight, and misc items kept by count.
  const [view, setView] = useState<View>("pieces");
  // Only one metal is listed at a time.
  const [metal, setMetal] = useState<"Gold" | "Silver">("Gold");
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newItemTypeName, setNewItemTypeName] = useState("");
  const [newItemTypeMetal, setNewItemTypeMetal] = useState("Gold");
  const [newPiecesPerGram, setNewPiecesPerGram] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await createItemType(newItemTypeName, newItemTypeMetal, view === "loose", Number(newPiecesPerGram) || undefined);
    setLoading(false);
    if (res.success) {
      setIsModalOpen(false);
      setNewItemTypeName("");
      setNewPiecesPerGram("");
      // It will auto-revalidate because of revalidatePath in the action
    } else {
      alert(res.error);
    }
  };

  const getStockForType = (typeId: string) => {
    return inventory.filter((item) => item.itemTypeId === typeId);
  };
  const shownTypes = itemTypes.filter((type) => type.metal === metal && type.loose === (view === "loose"));
  const pieces = (m: string) => inventory.filter((item) => item.metal === m).length;
  const looseOf = (typeId: string) => loose.filter((row) => row.itemTypeId === typeId);
  const looseWeight = (m: string) =>
    loose.filter((row) => itemTypes.some((type) => type.id === row.itemTypeId && type.metal === m)).reduce((sum, row) => sum + row.weight, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle={view === "pieces" ? "Pieces in the shop, by item type." : view === "loose" ? "Loose metal sold by weight, by item type." : "Miscellaneous items, counted in pieces."}
      >
        <Segmented
          label="Kind of stock"
          value={view}
          onChange={(next) => { setView(next); setExpandedTypeId(null); }}
          options={[
            { value: "pieces", label: "Pieces" },
            { value: "loose", label: "Loose" },
            { value: "misc", label: "Miscellaneous" },
          ]}
        />
        {view !== "misc" && (
          <Segmented
            label="Metal"
            value={metal}
            onChange={(next) => { setMetal(next); setExpandedTypeId(null); }}
            options={view === "pieces"
              ? [{ value: "Gold", label: `Gold · ${pieces("Gold")}` }, { value: "Silver", label: `Silver · ${pieces("Silver")}` }]
              : [{ value: "Gold", label: `Gold · ${grams(looseWeight("Gold"))}` }, { value: "Silver", label: `Silver · ${grams(looseWeight("Silver"))}` }]}
          />
        )}
        {toLabel > 0 && (
          <Link href="/inventory/label" className={btn("secondary")}>
            <Tag className="h-4 w-4" aria-hidden="true" />
            To label · {toLabel}
          </Link>
        )}
        {view === "misc" ? (
          <Link href="/misc" className={btn()}>Buy or sell misc items</Link>
        ) : (
          <button type="button" onClick={() => { setNewItemTypeMetal(metal); setIsModalOpen(true); }} className={btn()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {view === "loose" ? "New loose type" : "New item type"}
          </button>
        )}
      </PageHeader>

      {view === "misc" ? (
        <DataTable
          head={["Item", "Category", "Unit", "In hand"]}
          right={[3]}
          empty="No miscellaneous items yet. Add them on the Miscellaneous page."
          rows={misc.map((item) => [item.name, item.categoryName ?? "-", item.unit ?? "-", item.inHand])}
        />
      ) : shownTypes.length === 0 ? (
        <Card>
          <Empty icon={<PackageOpen className="h-5 w-5" />}>
            {view === "loose"
              ? `No loose ${metal.toLowerCase()} types yet. Create one for each kind of mani, such as 1x6 or 1x16.`
              : `No ${metal.toLowerCase()} item types yet. Create one to get started.`}
          </Empty>
        </Card>
      ) : view === "loose" ? (
        <div className={tableWrapClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-fg-2">
              <thead>
                <tr>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Melting</th>
                  <th className={`${thClass} text-right`}>About</th>
                  <th className={`${thClass} text-right`}>In stock</th>
                </tr>
              </thead>
              <tbody>
                {shownTypes.map((type) => {
                  const rows = looseOf(type.id);
                  const weight = rows.reduce((sum, row) => sum + row.weight, 0);
                  return (
                    <RowLink key={type.id} href={`/inventory/loose/${type.id}`} className={rowClass}>
                      <td className={tdClass}>
                        <Link href={`/inventory/loose/${type.id}`} className="font-medium text-fg">{type.name}</Link>
                        {type.piecesPerGram ? <span className="ml-2 text-fg-3">{type.piecesPerGram} to the gram</span> : null}
                      </td>
                      <td className={tdClass}>{rows.length === 0 ? "-" : rows.map((row) => `${row.melting}%`).join(", ")}</td>
                      <td className={`${tdClass} text-right tabular-nums`}>{type.piecesPerGram ? `${Math.round(weight * type.piecesPerGram)} pieces` : "-"}</td>
                      <td className={`${tdClass} text-right text-fg tabular-nums`}>{grams(weight)}</td>
                    </RowLink>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
            <h2 id="new-type-title" className="font-serif text-[1.375rem] font-medium text-fg">{view === "loose" ? "New loose type" : "New item type"}</h2>
            <p className="mt-1 text-[13px] text-fg-3">
              {view === "loose" ? "Loose metal is kept and sold by weight, with no labels. Make one type for each kind you keep apart." : "Pieces are grouped and labelled by their type."}
            </p>
            <form onSubmit={handleCreateType} className="mt-5 space-y-4">
              <Field
                label="Name"
                type="text"
                value={newItemTypeName}
                onChange={(e) => setNewItemTypeName(e.target.value)}
                placeholder={view === "loose" ? "e.g. Mani 1x16" : "e.g. Ring"}
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
              {view === "loose" && (
                <Field
                  label="Pieces to the gram (optional)"
                  type="number"
                  step="1"
                  min="1"
                  value={newPiecesPerGram}
                  onChange={(e) => setNewPiecesPerGram(e.target.value)}
                  placeholder="e.g. 16"
                  hint="Only used to show about how many pieces a weight comes to."
                />
              )}
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
