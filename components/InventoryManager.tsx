"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, PackageOpen, ChevronDown, ChevronRight } from "lucide-react";
import { stockStatus } from "@/lib/styles";
import { dateOnly } from "@/lib/format";
import { createItemType } from "@/app/actions/purchases";

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
}: {
  itemTypes: ItemType[];
  inventory: StockItem[];
}) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Inventory</h1>
          <p className="text-zinc-400 mt-1">Manage item types and view current stock.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Item Type
        </button>
      </div>

      <div className="space-y-4">
        {itemTypes.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-10 text-center">
             <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-3 bg-zinc-900 rounded-full">
                <PackageOpen className="h-8 w-8 text-zinc-500" />
              </div>
              <div className="text-zinc-400">No item types configured. Create one to get started.</div>
            </div>
          </div>
        ) : (
          itemTypes.map((type) => {
            const typeStock = getStockForType(type.id);
            const isExpanded = expandedTypeId === type.id;
            
            return (
              <div key={type.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/50 backdrop-blur-sm overflow-hidden transition-all">
                <button 
                  onClick={() => setExpandedTypeId(isExpanded ? null : type.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 sm:p-6 hover:bg-zinc-900/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${type.metal === 'Gold' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-300/10 text-slate-300'}`}>
                      {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </div>
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-zinc-100">{type.name}</h3>
                      <p className="text-sm text-zinc-400">Metal: {type.metal}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-zinc-400">Pieces</p>
                      <p className="text-xl font-bold text-zinc-100">{typeStock.length}</p>
                    </div>
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="border-t border-zinc-800 bg-zinc-950 px-4 sm:px-6 py-4 overflow-x-auto">
                    {typeStock.length === 0 ? (
                      <p className="text-sm text-zinc-500 py-4 text-center">No items of this type in stock.</p>
                    ) : (
                      <table className="w-full min-w-[32rem] text-left text-sm text-zinc-400">
                        <thead className="text-xs uppercase text-zinc-500">
                          <tr>
                            <th className="py-3 pr-4 font-medium whitespace-nowrap">Label</th>
                            <th className="py-3 pr-4 font-medium whitespace-nowrap">Date Added</th>
                            <th className="py-3 font-medium text-center">Type</th>
                            <th className="py-3 font-medium text-right">Weight (g)</th>
                            <th className="py-3 font-medium text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {typeStock.map((item) => (
                            <tr key={item.id} className="hover:bg-zinc-900/50">
                              <td className="py-3 pr-4 font-medium whitespace-nowrap">
                                <Link href={`/inventory/${item.id}`} className="text-amber-500 hover:text-amber-400">
                                  #{item.label ?? "-"}
                                </Link>
                              </td>
                              <td className="py-3 whitespace-nowrap">
                                {dateOnly(item.date)}
                              </td>
                              <td className="py-3 text-center">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                                  item.isNew ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"
                                }`}>
                                  {item.isNew ? "New Stock" : "Refurbished"}
                                </span>
                              </td>
                              <td className="py-3 text-right">{item.weight} g</td>
                              <td className="py-3 text-center">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${stockStatus[item.status ?? ""]?.className ?? ""}`}>
                                  {stockStatus[item.status ?? ""]?.label ?? item.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-zinc-100 mb-4">Create New Item Type</h2>
            <form onSubmit={handleCreateType} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Type Name</label>
                <input 
                  type="text"
                  className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-1 focus:ring-amber-500 outline-none"
                  value={newItemTypeName}
                  onChange={(e) => setNewItemTypeName(e.target.value)}
                  placeholder="e.g. Gold Ring"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Metal</label>
                <select 
                  className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-1 focus:ring-amber-500 outline-none"
                  value={newItemTypeMetal}
                  onChange={(e) => setNewItemTypeMetal(e.target.value)}
                >
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                </select>
              </div>
              
              <div className="flex justify-end pt-4 gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 rounded-xl bg-amber-500 text-zinc-950 text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition-all"
                >
                  {loading ? "Saving..." : "Save Type"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
