"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPurchase, createSupplier, PurchasePayload } from "@/app/actions/purchases";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { istDate } from "@/lib/format";
import { STANDARDS, STANDARD_PURITY, Standard } from "@/lib/standards";

type Supplier = { id: string; name: string | null };
type ItemType = { id: string; name: string; metal: string | null };
type OpenOrder = { id: string; name: string | null; metal: string | null; customerName: string | null };

export function PurchaseForm({ suppliers, itemTypes, orders }: { suppliers: Supplier[], itemTypes: ItemType[], orders: OpenOrder[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    supplierId: "",
    metal: "Gold",
    rate: 0,
    paidAmt: 0,
    mode: "cash",
  });

  const [standard, setStandard] = useState<Standard>("995");
  // The bill's own day, for bills entered later. Empty means today.
  const [billDate, setBillDate] = useState("");

  const [isNewSupplier, setIsNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierContact, setNewSupplierContact] = useState("");

  const [items, setItems] = useState<PurchasePayload["items"]>([{
    itemTypeId: "",
    grossWeight: 0,
    netWeight: 0,
    melting: 0,
    wastage: 0,
    making: 0,
    extraCharges: 0,
    amt: 0,
  }]);

  const handleItemChange = (index: number, field: string, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const varValue = STANDARD_PURITY[standard];

  // Auto-calculate derived values (fine and making are both on net weight)
  const calculatedItems = items.map(item => {
    const netWeight = item.netWeight || item.grossWeight;
    const fineW = (netWeight * (item.melting + item.wastage)) / varValue;
    const itemAmt = (fineW * formData.rate) + (netWeight * item.making) + item.extraCharges;
    return {
      ...item,
      netWeight,
      computedFine: fineW,
      computedAmt: Math.round(itemAmt),
    };
  });

  const computedTotalFine = Number(calculatedItems.reduce((sum, item) => sum + item.computedFine, 0).toFixed(3));
  const computedTotalAmt = calculatedItems.reduce((sum, item) => sum + item.computedAmt, 0);

  const addItem = () => {
    setItems([...items, { itemTypeId: "", grossWeight: 0, netWeight: 0, melting: 0, wastage: 0, making: 0, extraCharges: 0, amt: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNewSupplier && !formData.supplierId) return alert("Please select a supplier");
    if (isNewSupplier && !newSupplierName) return alert("Please enter a new supplier name");

    setLoading(true);

    let finalSupplierId = formData.supplierId;

    if (isNewSupplier) {
      const contactVal = newSupplierContact ? newSupplierContact : undefined;
      const supRes = await createSupplier(newSupplierName, contactVal);
      if (supRes.success && supRes.data) {
        finalSupplierId = supRes.data.id;
      } else {
        setLoading(false);
        return alert(supRes.error);
      }
    }

    const payload: PurchasePayload = {
      ...formData,
      date: billDate || undefined,
      standard,
      fine: computedTotalFine,
      supplierId: finalSupplierId,
      billAmt: computedTotalAmt,
      items: calculatedItems.map(item => ({
        itemTypeId: item.itemTypeId,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        melting: item.melting,
        wastage: item.wastage,
        making: item.making,
        extraCharges: item.extraCharges,
        amt: item.computedAmt,
        orderId: item.orderId || undefined,
      })),
    };

    const res = await createPurchase(payload);
    setLoading(false);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        router.push("/purchases");
      }, 1500);
    } else {
      alert(res.error);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-emerald-500">
        <CheckCircle2 className="h-16 w-16 mb-4" />
        <h2 className="text-xl font-bold">Purchase Recorded Successfully!</h2>
        <p className="text-zinc-400 mt-2">Redirecting to purchases...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Bill Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Supplier</label>
          <select 
            className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none mb-2"
            value={isNewSupplier ? "new" : formData.supplierId}
            onChange={(e) => {
              if (e.target.value === "new") {
                setIsNewSupplier(true);
              } else {
                setIsNewSupplier(false);
                setFormData({...formData, supplierId: e.target.value});
              }
            }}
            required={!isNewSupplier}
          >
            <option value="">Select a supplier...</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value="new">+ Add New Supplier</option>
          </select>

          {isNewSupplier && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text"
                className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none"
                placeholder="Supplier name"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                autoFocus
                required
              />
              <input 
                type="number"
                className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none"
                placeholder="Contact number (optional)"
                value={newSupplierContact}
                onChange={(e) => setNewSupplierContact(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2 pt-2">
            <label htmlFor="bill-date" className="text-sm font-medium text-zinc-300">Bill date <span className="text-zinc-500 font-normal">(today if left empty)</span></label>
            <input
              id="bill-date"
              type="date"
              className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none"
              value={billDate}
              max={istDate()}
              onChange={(e) => setBillDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">{formData.metal} Rate (₹/g fine)</label>
            <input 
              type="number"
              className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none"
              value={formData.rate || ''}
              onChange={(e) => setFormData({...formData, rate: Number(e.target.value)})}
              placeholder="e.g. 7000"
              required
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Metal</label>
              <select
                className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none"
                value={formData.metal}
                onChange={(e) => {
                  setFormData({...formData, metal: e.target.value});
                  setItems(items.map(item => ({ ...item, itemTypeId: "" })));
                }}
              >
                <option value="Gold">Gold</option>
                <option value="Silver">Silver</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Standard</label>
              <select
                className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none"
                value={standard}
                onChange={(e) => setStandard(e.target.value as Standard)}
              >
                {STANDARDS.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-zinc-200">Items</h3>
          <button type="button" onClick={addItem} className="flex items-center gap-1 text-sm text-amber-500 hover:text-amber-400">
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>
        
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4 relative group">
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(index)} className="absolute top-4 right-4 text-zinc-500 hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pr-8">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-medium text-zinc-400">Item Type</label>
                  <select 
                    className="w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={item.itemTypeId}
                    onChange={(e) => handleItemChange(index, "itemTypeId", e.target.value)}
                    required
                  >
                    <option value="">Select Item Type</option>
                    {itemTypes.filter(it => it.metal === formData.metal).map(it => (
                      <option key={it.id} value={it.id}>{it.name} ({it.metal})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">Gross Wt (g)</label>
                  <input 
                    type="number"
                    step="0.001"
                    className="w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={item.grossWeight || ''}
                    onChange={(e) => handleItemChange(index, "grossWeight", Number(e.target.value))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">Net Wt (g)</label>
                  <input
                    type="number"
                    step="0.001"
                    className="w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={item.netWeight || ''}
                    onChange={(e) => handleItemChange(index, "netWeight", Number(e.target.value))}
                    placeholder="same as gross"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">Purity/Melting (%)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={item.melting || ''}
                    onChange={(e) => handleItemChange(index, "melting", Number(e.target.value))}
                    placeholder="e.g. 91.6"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">Wastage (%)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={item.wastage || ''}
                    onChange={(e) => handleItemChange(index, "wastage", Number(e.target.value))}
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">Making (₹/g)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={item.making || ''}
                    onChange={(e) => handleItemChange(index, "making", Number(e.target.value))}
                    placeholder="e.g. 400"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">Extra Chg (₹)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={item.extraCharges || ''}
                    onChange={(e) => handleItemChange(index, "extraCharges", Number(e.target.value))}
                    placeholder="e.g. 200"
                  />
                </div>
                {orders.some(o => o.metal === formData.metal) && (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-zinc-400">Made for order (optional)</label>
                    <select
                      className="w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none"
                      value={item.orderId ?? ""}
                      onChange={(e) => handleItemChange(index, "orderId", e.target.value)}
                    >
                      <option value="">Not for an order</option>
                      {orders.filter(o => o.metal === formData.metal).map(o => (
                        <option key={o.id} value={o.id}>{o.name} - {o.customerName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment & Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-zinc-800 pt-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">Payment details</h3>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Fine {formData.metal} Due (g) <span className="text-zinc-500 font-normal">in lieu of cash (auto-calculated)</span></label>
            <input 
              type="text"
              className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-400 px-4 py-2.5 outline-none bg-zinc-950/50 cursor-not-allowed"
              value={computedTotalFine.toFixed(3)}
              readOnly
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Amount Paid Now</label>
            <input 
              type="number"
              className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 outline-none focus:ring-1 focus:ring-amber-500"
              value={formData.paidAmt || ''}
              onChange={(e) => setFormData({...formData, paidAmt: Number(e.target.value)})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Payment Mode</label>
            <select 
              className="w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 outline-none focus:ring-1 focus:ring-amber-500"
              value={formData.mode}
              onChange={(e) => setFormData({...formData, mode: e.target.value})}
            >
              <option value="cash">Cash (Vault)</option>
              <option value="online">Online (Bank)</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl bg-amber-500/10 p-4 sm:p-6 flex flex-col justify-center border border-amber-500/20">
          <div className="space-y-2">
            <div className="flex justify-between text-zinc-400">
              <span>Items Cash Total:</span>
              <span>₹ {computedTotalAmt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-amber-500/80 font-medium">
              <span>Fine {formData.metal} Due:</span>
              <span>{computedTotalFine.toFixed(3)} g</span>
            </div>
            <div className="border-t border-amber-500/20 my-2 pt-2 flex justify-between gap-3 text-lg sm:text-xl font-bold text-amber-500">
              <span>Total Bill Amount:</span>
              <span>₹ {computedTotalAmt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-zinc-300 text-sm mt-4">
              <span>Paid:</span>
              <span className="text-emerald-400">₹ {formData.paidAmt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-zinc-300 text-sm font-semibold">
              <span>Balance Due:</span>
              <span className="text-red-400">₹ {Math.max(0, computedTotalAmt - formData.paidAmt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-zinc-800">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors mr-4"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-8 py-2.5 rounded-xl bg-amber-500 text-zinc-950 text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
        >
          {loading ? "Saving..." : "Save Purchase"}
        </button>
      </div>
    </form>
  );
}
