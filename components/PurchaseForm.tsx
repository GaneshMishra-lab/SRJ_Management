"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPurchase, createSupplier, PurchasePayload } from "@/app/actions/purchases";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Segmented } from "@/components/controls";
import { CreditFields } from "@/components/CreditFields";
import type { Credit } from "@/components/CreditFields";
import { Card, Field, SelectField, SummaryRow } from "@/components/ui";
import { btn, iconButtonClass, labelClass } from "@/lib/styles";
import { grams, inr, istDate } from "@/lib/format";
import { STANDARDS, STANDARD_PURITY, Standard } from "@/lib/standards";

type Supplier = { id: string; name: string | null };
type ItemType = { id: string; name: string; metal: string | null };
type OpenOrder = { id: string; name: string | null; metal: string | null; customerName: string | null };

export function PurchaseForm({
  suppliers,
  itemTypes,
  orders,
  date,
  metal,
  onSaved,
  onCancel,
}: {
  suppliers: Supplier[];
  itemTypes: ItemType[];
  orders: OpenOrder[];
  // Given when the place the form is opened from settles the metal (a purchase head of the day
  // book): the bill is of that metal and the choice is not offered.
  metal?: "Gold" | "Silver";
  // The bill's day to start from, when the form is opened for a day other than today.
  date?: string;
  // Given when the form is shown inside another screen (the day book's popup), which then
  // decides what happens next. Left out, a saved bill leads to the list and Cancel goes back a page.
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    supplierId: "",
    metal: metal ?? "Gold",
    rate: 0,
    paidAmt: 0,
    mode: "cash",
  });
  const [credit, setCredit] = useState<Credit>({ creditDays: "", dueDate: "" });

  const [standard, setStandard] = useState<Standard>("995");
  // The bill's own day, for bills entered later. Empty means today.
  const [billDate, setBillDate] = useState(date ?? "");
  const [billTime, setBillTime] = useState("");

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
      time: billTime || undefined,
      ...credit,
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
      if (onSaved) return onSaved();
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
      <Card>
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle2 className="mb-3 h-10 w-10 text-ok" strokeWidth={1.5} />
          <h2 className="font-serif text-xl font-medium text-fg">Purchase recorded</h2>
          <p className="mt-1 text-sm text-fg-3">Taking you back to purchases...</p>
        </div>
      </Card>
    );
  }

  const metalOrders = orders.filter(o => o.metal === formData.metal);
  const balanceDue = Math.max(0, computedTotalAmt - formData.paidAmt);

  // The bill on the left; what it comes to stays in view on the right while the items are filled in.
  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-6">
        <Card title="Bill">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Supplier"
              className="sm:col-span-2"
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
              <option value="new">+ Add new supplier</option>
            </SelectField>

            {isNewSupplier && (
              <>
                <Field
                  label="New supplier name"
                  type="text"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  autoFocus
                  required
                />
                <Field
                  label="Contact number (optional)"
                  type="tel"
                  value={newSupplierContact}
                  onChange={(e) => setNewSupplierContact(e.target.value)}
                />
              </>
            )}

            <Field
              label="Bill date"
              hint="Leave empty for today."
              type="date"
              value={billDate}
              max={istDate()}
              onChange={(e) => setBillDate(e.target.value)}
            />
            <Field
              label="Bill time"
              hint="Leave empty for the time now."
              type="time"
              value={billTime}
              onChange={(e) => setBillTime(e.target.value)}
            />
            {!metal && (
              <div className="space-y-1.5">
                <span className={labelClass}>Metal</span>
                <Segmented
                  label="Metal"
                  className="w-full"
                  value={formData.metal}
                  onChange={(metal) => {
                    setFormData({...formData, metal});
                    setItems(items.map(item => ({ ...item, itemTypeId: "" })));
                  }}
                  options={[{ value: "Gold", label: "Gold" }, { value: "Silver", label: "Silver" }]}
                />
              </div>
            )}
            <Field
              label={`${formData.metal} rate (₹ per gram fine)`}
              type="number"
              value={formData.rate || ''}
              onChange={(e) => setFormData({...formData, rate: Number(e.target.value)})}
              placeholder="e.g. 7000"
              required
            />
            <SelectField label="Standard" value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
              {STANDARDS.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </SelectField>
          </div>
        </Card>

        <Card
          title="Items"
          action={
            <button type="button" onClick={addItem} className={btn("secondary", "sm")}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add item
            </button>
          }
        >
          <div className="divide-y divide-line">
            {items.map((item, index) => (
              <div key={index} className="space-y-4 py-5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-fg">
                    Item {index + 1}
                    <span className="ml-2 font-normal text-fg-3 tabular-nums">
                      {grams(calculatedItems[index].computedFine)} fine · {inr(calculatedItems[index].computedAmt)}
                    </span>
                  </p>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(index)} aria-label={`Remove item ${index + 1}`} title="Remove" className={`-my-1 ${iconButtonClass} hover:text-bad`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <SelectField
                    label="Item type"
                    className="col-span-2"
                    value={item.itemTypeId}
                    onChange={(e) => handleItemChange(index, "itemTypeId", e.target.value)}
                    required
                  >
                    <option value="">Select item type</option>
                    {itemTypes.filter(it => it.metal === formData.metal).map(it => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </SelectField>
                  <Field
                    label="Gross weight (g)"
                    type="number"
                    step="0.001"
                    value={item.grossWeight || ''}
                    onChange={(e) => handleItemChange(index, "grossWeight", Number(e.target.value))}
                    required
                  />
                  <Field
                    label="Net weight (g)"
                    type="number"
                    step="0.001"
                    value={item.netWeight || ''}
                    onChange={(e) => handleItemChange(index, "netWeight", Number(e.target.value))}
                    placeholder="Same as gross"
                  />
                  <Field
                    label="Melting (%)"
                    type="number"
                    step="0.01"
                    value={item.melting || ''}
                    onChange={(e) => handleItemChange(index, "melting", Number(e.target.value))}
                    placeholder="e.g. 91.6"
                  />
                  <Field
                    label="Wastage (%)"
                    type="number"
                    step="0.01"
                    value={item.wastage || ''}
                    onChange={(e) => handleItemChange(index, "wastage", Number(e.target.value))}
                    placeholder="e.g. 5"
                  />
                  <Field
                    label="Making (₹/g)"
                    type="number"
                    step="0.01"
                    value={item.making || ''}
                    onChange={(e) => handleItemChange(index, "making", Number(e.target.value))}
                    placeholder="e.g. 400"
                  />
                  <Field
                    label="Extra charges (₹)"
                    type="number"
                    step="0.01"
                    value={item.extraCharges || ''}
                    onChange={(e) => handleItemChange(index, "extraCharges", Number(e.target.value))}
                    placeholder="e.g. 200"
                  />
                  {metalOrders.length > 0 && (
                    <SelectField
                      label="Made for order (optional)"
                      className="col-span-2"
                      value={item.orderId ?? ""}
                      onChange={(e) => handleItemChange(index, "orderId", e.target.value)}
                    >
                      <option value="">Not for an order</option>
                      {metalOrders.map(o => (
                        <option key={o.id} value={o.id}>{o.name} - {o.customerName}</option>
                      ))}
                    </SelectField>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24">
        <Card title="Payment">
          <div className="space-y-4">
            <Field
              label="Amount paid now (₹)"
              type="number"
              value={formData.paidAmt || ''}
              onChange={(e) => setFormData({...formData, paidAmt: Number(e.target.value)})}
            />
            <SelectField label="Payment mode" value={formData.mode} onChange={(e) => setFormData({...formData, mode: e.target.value})}>
              <option value="cash">Cash (Vault)</option>
              <option value="online">Online (Bank)</option>
            </SelectField>
            {/* The supplier's credit on what is left; nothing to ask when the bill is paid in full. */}
            <div hidden={balanceDue <= 0}>
              <CreditFields baseDay={billDate || undefined} onChange={setCredit} />
            </div>

            <dl className="space-y-2 pt-1">
              <SummaryRow label="Items total" value={inr(computedTotalAmt)} />
              <SummaryRow label={`Fine ${formData.metal.toLowerCase()} due`} value={grams(computedTotalFine)} />
              <SummaryRow label="Bill amount" value={inr(computedTotalAmt)} strong />
              <SummaryRow label="Paid now" value={inr(formData.paidAmt)} tone="ok" />
              <SummaryRow label="Balance due" value={inr(balanceDue)} tone={balanceDue > 0 ? "accent" : undefined} />
            </dl>

            <div className="flex flex-col gap-2 pt-1">
              <button type="submit" disabled={loading} className={btn()}>
                {loading ? "Saving..." : "Save purchase"}
              </button>
              <button type="button" onClick={() => (onCancel ? onCancel() : router.back())} className={btn("ghost")}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      </aside>
    </form>
  );
}
