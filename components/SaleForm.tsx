"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createSale } from "@/app/actions/sales";
import { GST_PCT, priceSaleLine, purityRate, round2 } from "@/lib/pricing";
import { dateOnly, grams, inr } from "@/lib/format";

type Customer = { id: string; name: string | null };
type Piece = {
  id: string;
  label: number | null;
  typeName: string | null;
  metal: string | null;
  netWeight: number | null;
  melting: number | null;
  status: string | null;
};
type Line = { stockId: string; rate: number; makingPct: number };
type OldGold = { metal: string; weight: number; melting: number; amt: number };
type ReadyOrder = {
  id: string;
  customerId: string | null;
  name: string | null;
  stockIds: string[];
  advance: number;
  bookedRate: number | null;
};

const inputClass = "w-full rounded-xl bg-zinc-900 border-zinc-800 text-zinc-100 px-4 py-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none";
const smallInputClass = "w-full rounded-lg bg-zinc-950 border-zinc-800 text-sm px-3 py-2 text-zinc-100 focus:ring-1 focus:ring-amber-500 outline-none";

export function SaleForm({
  customers,
  pieces,
  rates,
  orders,
  date,
}: {
  customers: Customer[];
  pieces: Piece[];
  rates: { Gold: number | null; Silver: number | null };
  orders: ReadyOrder[];
  // The bill's own day (YYYY-MM-DD) when the sale is entered later; today if left out.
  date?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const isNewCustomer = customerId === "new";

  const [lines, setLines] = useState<Line[]>([]);
  const [orderId, setOrderId] = useState("");
  const [oldGold, setOldGold] = useState<OldGold[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paidAmt, setPaidAmt] = useState(0);
  const [mode, setMode] = useState("cash");
  // For a bill entered later: the day its money goes into the cash book, if not the bill's own day.
  const [paymentDate, setPaymentDate] = useState("");

  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const pieceName = (piece: Piece) => `${piece.typeName ?? "Piece"} #${piece.label ?? "-"}`;
  const available = pieces.filter((piece) => !lines.some((line) => line.stockId === piece.id));

  const addPiece = (stockId: string) => {
    const piece = pieceById.get(stockId);
    if (!piece) return;
    const fineRate = piece.metal === "Silver" ? rates.Silver : rates.Gold;
    setLines([...lines, { stockId, rate: purityRate(fineRate ?? 0, piece.melting ?? 0), makingPct: 0 }]);
  };

  // Delivering an order: bring in its customer and its piece, priced at the booked rate if there is one.
  const order = orders.find((o) => o.id === orderId);
  const chooseOrder = (id: string) => {
    setOrderId(id);
    const chosen = orders.find((o) => o.id === id);
    if (!chosen) return;
    if (chosen.customerId) setCustomerId(chosen.customerId);
    const added = chosen.stockIds
      .filter((stockId) => pieceById.has(stockId) && !lines.some((line) => line.stockId === stockId))
      .map((stockId) => {
        const piece = pieceById.get(stockId)!;
        const fineRate = chosen.bookedRate ?? (piece.metal === "Silver" ? rates.Silver : rates.Gold) ?? 0;
        return { stockId, rate: purityRate(fineRate, piece.melting ?? 0), makingPct: 0 };
      });
    setLines([...lines, ...added]);
  };

  const updateOldGold = (index: number, field: keyof OldGold, value: string | number) => {
    setOldGold(oldGold.map((old, i) => (i === index ? { ...old, [field]: value } : old)));
  };
  const suggestOldValue = (old: OldGold) => {
    const fineRate = (old.metal === "Silver" ? rates.Silver : rates.Gold) ?? 0;
    return round2((old.weight * old.melting * fineRate) / 100);
  };

  const updateLine = (index: number, field: "rate" | "makingPct", value: number) => {
    setLines(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const priced = lines.map((line) => ({
    ...line,
    ...priceSaleLine({ netWeight: pieceById.get(line.stockId)?.netWeight ?? 0, rate: line.rate, makingPct: line.makingPct }),
  }));
  const computedAmt = round2(priced.reduce((sum, line) => sum + line.amt, 0));
  const totalAmt = round2(computedAmt - discount);
  const advance = order?.advance ?? 0;
  const oldGoldAmt = round2(oldGold.reduce((sum, old) => sum + old.amt, 0));
  const balanceDue = round2(totalAmt - advance - oldGoldAmt - paidAmt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerId) return setError("Choose a customer.");
    if (lines.length === 0) return setError("Add at least one piece to the bill.");

    setLoading(true);
    const res = await createSale({
      date,
      customerId: isNewCustomer ? undefined : customerId,
      newCustomer: isNewCustomer ? { name: newCustomerName, contact: newCustomerContact } : undefined,
      orderId: orderId || undefined,
      items: lines,
      oldGold,
      discount,
      paidAmt,
      mode,
      paymentDate: paymentDate || undefined,
    });

    if (res.success) {
      router.push(`/sales/${res.id}`);
    } else {
      setLoading(false);
      setError(res.error ?? "Failed to create the sale.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {date && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
          This bill, and any payment or old metal on it, will be dated {dateOnly(date)}.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label htmlFor="customer" className="text-sm font-medium text-zinc-300">Customer</label>
          <select id="customer" className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">Select a customer...</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
            <option value="new">+ Add New Customer</option>
          </select>
          {isNewCustomer && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                className={inputClass}
                placeholder="Customer name"
                aria-label="New customer name"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                autoFocus
                required
              />
              <input
                type="tel"
                className={inputClass}
                placeholder="Contact number (optional)"
                aria-label="New customer contact number"
                value={newCustomerContact}
                onChange={(e) => setNewCustomerContact(e.target.value)}
              />
            </div>
          )}
        </div>

        {orders.length > 0 && (
          <div className="space-y-2">
            <label htmlFor="order" className="text-sm font-medium text-zinc-300">Delivering an order?</label>
            <select id="order" className={inputClass} value={orderId} onChange={(e) => chooseOrder(e.target.value)}>
              <option value="">No, a normal sale</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {customers.find((c) => c.id === o.customerId)?.name ?? "customer"} · advance {inr(o.advance)}
                </option>
              ))}
            </select>
            {order?.bookedRate && (
              <p className="text-xs text-amber-500">Rate was booked at {inr(order.bookedRate)} per gram fine; the order&apos;s piece is billed at that rate.</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="add-piece" className="text-sm font-medium text-zinc-300">Add a piece</label>
          <select id="add-piece" className={inputClass} value="" onChange={(e) => addPiece(e.target.value)}>
            <option value="">{available.length === 0 ? "No more pieces available" : "Select a piece..."}</option>
            {available.map((piece) => (
              <option key={piece.id} value={piece.id}>
                {pieceName(piece)} · {piece.metal} · {grams(piece.netWeight)}{piece.status === "on_approval" ? " · on approval" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-zinc-200">Pieces</h3>
        {priced.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
            No pieces added yet.
          </p>
        ) : (
          priced.map((line, index) => {
            const piece = pieceById.get(line.stockId)!;
            return (
              <div key={line.stockId} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-zinc-100">
                    {pieceName(piece)}
                    <span className="ml-2 text-sm font-normal text-zinc-400">
                      {piece.metal} · {grams(piece.netWeight)} · {piece.melting ?? 0}% melting
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setLines(lines.filter((_, i) => i !== index))}
                    aria-label={`Remove ${pieceName(piece)}`}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">Rate (₹/g at this purity)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={smallInputClass}
                      value={line.rate || ""}
                      onChange={(e) => updateLine(index, "rate", Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">Making % (with wastage)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={smallInputClass}
                      value={line.makingPct || ""}
                      onChange={(e) => updateLine(index, "makingPct", Number(e.target.value))}
                      placeholder="e.g. 12"
                    />
                  </div>
                  <div className="text-sm text-zinc-400">
                    <p>Metal: {inr(line.metalValue)}</p>
                    <p>Making: {inr(line.makingAmt)}</p>
                    <p>GST {GST_PCT}%: {inr(line.gst)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500">Amount</p>
                    <p className="text-lg font-semibold text-zinc-100">{inr(line.amt)}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-medium text-zinc-200">Old metal in exchange</h3>
          <button
            type="button"
            onClick={() => setOldGold([...oldGold, { metal: "Gold", weight: 0, melting: 0, amt: 0 }])}
            className="text-sm text-amber-500 hover:text-amber-400"
          >
            + Add old item
          </button>
        </div>
        {oldGold.map((old, index) => (
          <div key={index} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Metal</label>
              <select className={smallInputClass} value={old.metal} onChange={(e) => updateOldGold(index, "metal", e.target.value)}>
                <option value="Gold">Gold</option>
                <option value="Silver">Silver</option>
                <option value="Phuli">Phuli</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Weight (g)</label>
              <input type="number" step="0.001" min="0.001" className={smallInputClass} value={old.weight || ""} onChange={(e) => updateOldGold(index, "weight", Number(e.target.value))} required />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Melting (%)</label>
              <input type="number" step="0.001" min="0.001" max="100" className={smallInputClass} value={old.melting || ""} onChange={(e) => updateOldGold(index, "melting", Number(e.target.value))} required />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Agreed value (₹)</label>
              <input type="number" step="0.01" min="0.01" className={smallInputClass} value={old.amt || ""} onChange={(e) => updateOldGold(index, "amt", Number(e.target.value))} placeholder={String(suggestOldValue(old) || "")} required />
            </div>
            <div className="flex items-center justify-between gap-2 pb-2">
              <button type="button" onClick={() => updateOldGold(index, "amt", suggestOldValue(old))} className="text-xs text-amber-500 hover:text-amber-400">
                Use {inr(suggestOldValue(old))}
              </button>
              <button type="button" onClick={() => setOldGold(oldGold.filter((_, i) => i !== index))} aria-label="Remove old item" className="text-zinc-500 hover:text-red-400">
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-zinc-800 pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="discount" className="text-sm font-medium text-zinc-300">Discount (₹)</label>
            <input
              id="discount"
              type="number"
              step="0.01"
              min="0"
              max={computedAmt}
              className={inputClass}
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="paid" className="text-sm font-medium text-zinc-300">Amount Paid Now</label>
            <input
              id="paid"
              type="number"
              step="0.01"
              min="0"
              max={Math.max(0, round2(totalAmt - advance - oldGoldAmt))}
              className={inputClass}
              value={paidAmt || ""}
              onChange={(e) => setPaidAmt(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="mode" className="text-sm font-medium text-zinc-300">Payment Mode</label>
            <select id="mode" className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="cash">Cash (Vault)</option>
              <option value="online">Online (Bank)</option>
            </select>
          </div>
          {date && (
            <div className="space-y-2">
              <label htmlFor="payment-date" className="text-sm font-medium text-zinc-300">
                Payment entered on <span className="text-zinc-500 font-normal">(bill date if left empty)</span>
              </label>
              <input id="payment-date" type="date" min={date} className={inputClass} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              <p className="text-xs text-zinc-500">
                When this bill replaces a cancelled one, choose the day of the correction, so the cash book of earlier days stays as it was.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-amber-500/10 p-4 sm:p-6 flex flex-col justify-center border border-amber-500/20 space-y-2">
          <div className="flex justify-between text-zinc-400">
            <span>Computed amount:</span>
            <span>{inr(computedAmt)}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Discount:</span>
            <span>- {inr(discount)}</span>
          </div>
          <div className="border-t border-amber-500/20 pt-2 flex justify-between gap-3 text-lg sm:text-xl font-bold text-amber-500">
            <span>Bill Total:</span>
            <span>{inr(totalAmt)}</span>
          </div>
          {advance > 0 && (
            <div className="flex justify-between text-zinc-300 text-sm pt-2">
              <span>Order advance:</span>
              <span className="text-emerald-400">{inr(advance)}</span>
            </div>
          )}
          {oldGoldAmt > 0 && (
            <div className="flex justify-between text-zinc-300 text-sm pt-2">
              <span>Old metal:</span>
              <span className="text-emerald-400">{inr(oldGoldAmt)}</span>
            </div>
          )}
          <div className="flex justify-between text-zinc-300 text-sm pt-2">
            <span>Paid now:</span>
            <span className="text-emerald-400">{inr(paidAmt)}</span>
          </div>
          <div className="flex justify-between text-zinc-300 text-sm font-semibold">
            <span>Balance Due:</span>
            <span className="text-red-400">{inr(Math.max(0, balanceDue))}</span>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

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
          {loading ? "Saving..." : "Save Sale"}
        </button>
      </div>
    </form>
  );
}
