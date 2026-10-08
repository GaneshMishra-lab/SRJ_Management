"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createSale } from "@/app/actions/sales";
import { GST_PCT, priceSaleLine, purityRate, round2 } from "@/lib/pricing";
import { dateOnly, grams, inr } from "@/lib/format";
import { Card, Field, Notice, SelectField, SummaryRow } from "@/components/ui";
import { btn, iconButtonClass, linkClass } from "@/lib/styles";

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
// Loose metal (mani) on hand: one choice per type and melting, sold by weight.
type Loose = {
  itemTypeId: string;
  typeName: string | null;
  metal: string | null;
  piecesPerGram: number | null;
  melting: number;
  weight: number;
};
type LooseLine = { itemTypeId: string; melting: number; weight: number; rate: number; makingPct: number };
const looseKey = (row: { itemTypeId: string; melting: number }) => `${row.itemTypeId}|${row.melting}`;
type OldGold = { metal: string; weight: number; melting: number; amt: number };
type ReadyOrder = {
  id: string;
  customerId: string | null;
  name: string | null;
  stockIds: string[];
  advance: number;
  bookedRate: number | null;
};

export function SaleForm({
  customers,
  pieces,
  loose = [],
  rates,
  orders,
  date,
  onSaved,
  onCancel,
}: {
  customers: Customer[];
  pieces: Piece[];
  loose?: Loose[];
  rates: { Gold: number | null; Silver: number | null };
  orders: ReadyOrder[];
  // The bill's own day (YYYY-MM-DD) when the sale is entered later; today if left out.
  date?: string;
  // Given when the form is shown inside another screen (the day book's popup), which then
  // decides what happens next. Left out, a saved bill opens and Cancel goes back a page.
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const isNewCustomer = customerId === "new";

  const [lines, setLines] = useState<Line[]>([]);
  const [looseLines, setLooseLines] = useState<LooseLine[]>([]);
  const [orderId, setOrderId] = useState("");
  const [oldGold, setOldGold] = useState<OldGold[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paidAmt, setPaidAmt] = useState(0);
  const [mode, setMode] = useState("cash");
  // For a bill entered later: the day its money goes into the cash book, if not the bill's own day.
  const [paymentDate, setPaymentDate] = useState("");
  // The time of the sale on the bill's day. Empty means the time now.
  const [billTime, setBillTime] = useState("");

  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const pieceName = (piece: Piece) => `${piece.typeName ?? "Piece"} #${piece.label ?? "-"}`;
  const available = pieces.filter((piece) => !lines.some((line) => line.stockId === piece.id));

  const addPiece = (stockId: string) => {
    const piece = pieceById.get(stockId);
    if (!piece) return;
    const fineRate = piece.metal === "Silver" ? rates.Silver : rates.Gold;
    setLines([...lines, { stockId, rate: purityRate(fineRate ?? 0, piece.melting ?? 0), makingPct: 0 }]);
  };

  const looseByKey = new Map(loose.map((row) => [looseKey(row), row]));
  const looseName = (row: Loose) => `${row.typeName ?? "Loose"} · ${row.melting}%`;
  const looseAvailable = loose.filter((row) => !looseLines.some((line) => looseKey(line) === looseKey(row)));
  const addLoose = (key: string) => {
    const row = looseByKey.get(key);
    if (!row) return;
    const fineRate = row.metal === "Silver" ? rates.Silver : rates.Gold;
    setLooseLines([...looseLines, { itemTypeId: row.itemTypeId, melting: row.melting, weight: 0, rate: purityRate(fineRate ?? 0, row.melting), makingPct: 0 }]);
  };
  const updateLoose = (index: number, field: "weight" | "rate" | "makingPct", value: number) => {
    setLooseLines(looseLines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
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
  const pricedLoose = looseLines.map((line) => ({
    ...line,
    ...priceSaleLine({ netWeight: line.weight, rate: line.rate, makingPct: line.makingPct }),
  }));
  const computedAmt = round2([...priced, ...pricedLoose].reduce((sum, line) => sum + line.amt, 0));
  const totalAmt = round2(computedAmt - discount);
  const advance = order?.advance ?? 0;
  const oldGoldAmt = round2(oldGold.reduce((sum, old) => sum + old.amt, 0));
  const balanceDue = round2(totalAmt - advance - oldGoldAmt - paidAmt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerId) return setError("Choose a customer.");
    if (lines.length === 0 && looseLines.length === 0) return setError("Add at least one piece or loose item to the bill.");

    setLoading(true);
    const res = await createSale({
      date,
      time: billTime || undefined,
      customerId: isNewCustomer ? undefined : customerId,
      newCustomer: isNewCustomer ? { name: newCustomerName, contact: newCustomerContact } : undefined,
      orderId: orderId || undefined,
      items: lines,
      loose: looseLines,
      oldGold,
      discount,
      paidAmt,
      mode,
      paymentDate: paymentDate || undefined,
    });

    if (res.success) {
      if (onSaved) onSaved();
      else router.push(`/sales/${res.id}`);
    } else {
      setLoading(false);
      setError(res.error ?? "Failed to create the sale.");
    }
  };

  const toPay = Math.max(0, round2(totalAmt - advance - oldGoldAmt));

  // The bill on the left; what it comes to stays in view on the right while the pieces are added.
  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-6">
        {date && (
          <Notice tone="info">
            This bill, and any payment or old metal on it, will be dated <strong className="font-semibold">{dateOnly(date)}</strong>.
          </Notice>
        )}

        <Card title="Customer">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="Customer" className={orders.length === 0 && !isNewCustomer ? "sm:col-span-2" : ""} value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select a customer...</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
              <option value="new">+ Add new customer</option>
            </SelectField>

            {orders.length > 0 && (
              <SelectField
                label="Delivering an order?"
                value={orderId}
                onChange={(e) => chooseOrder(e.target.value)}
                hint={order?.bookedRate ? `Rate was booked at ${inr(order.bookedRate)} per gram fine; the order's piece is billed at that rate.` : undefined}
              >
                <option value="">No, a normal sale</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {customers.find((c) => c.id === o.customerId)?.name ?? "customer"} · advance {inr(o.advance)}
                  </option>
                ))}
              </SelectField>
            )}

            {isNewCustomer && (
              <>
                <Field
                  label="New customer name"
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  autoFocus
                  required
                />
                <Field
                  label="Contact number (optional)"
                  type="tel"
                  value={newCustomerContact}
                  onChange={(e) => setNewCustomerContact(e.target.value)}
                />
              </>
            )}
          </div>
        </Card>

        <Card title="Pieces">
          <SelectField label="Add a piece" value="" onChange={(e) => addPiece(e.target.value)}>
            <option value="">{available.length === 0 ? "No more pieces available" : "Select a piece..."}</option>
            {available.map((piece) => (
              <option key={piece.id} value={piece.id}>
                {pieceName(piece)} · {piece.metal} · {grams(piece.netWeight)}{piece.status === "on_approval" ? " · on approval" : ""}
              </option>
            ))}
          </SelectField>

          {priced.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-3">No pieces on this bill yet.</p>
          ) : (
            <div className="mt-2 divide-y divide-line">
              {priced.map((line, index) => {
                const piece = pieceById.get(line.stockId)!;
                return (
                  <div key={line.stockId} className="space-y-3 py-5 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg">{pieceName(piece)}</p>
                        <p className="text-[13px] text-fg-3">{piece.metal} · {grams(piece.netWeight)} · {piece.melting ?? 0}% melting</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-serif text-lg font-medium text-fg tabular-nums">{inr(line.amt)}</p>
                        <button
                          type="button"
                          onClick={() => setLines(lines.filter((_, i) => i !== index))}
                          aria-label={`Remove ${pieceName(piece)}`}
                          title="Remove"
                          className={`-my-1 ${iconButtonClass} hover:text-bad`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="Rate (₹/g at this purity)"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={line.rate || ""}
                        onChange={(e) => updateLine(index, "rate", Number(e.target.value))}
                        required
                      />
                      <Field
                        label="Making % (with wastage)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.makingPct || ""}
                        onChange={(e) => updateLine(index, "makingPct", Number(e.target.value))}
                        placeholder="e.g. 12"
                      />
                    </div>
                    <p className="text-[13px] text-fg-3 tabular-nums">
                      Metal {inr(line.metalValue)} · Making {inr(line.makingAmt)} · GST {GST_PCT}% {inr(line.gst)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {loose.length > 0 && (
          <Card title="Loose metal" hint="Mani and other metal sold by weight, out of the stock of its type and melting.">
            <SelectField label="Add loose metal" value="" onChange={(e) => addLoose(e.target.value)}>
              <option value="">{looseAvailable.length === 0 ? "No more loose metal available" : "Select a type..."}</option>
              {looseAvailable.map((row) => (
                <option key={looseKey(row)} value={looseKey(row)}>
                  {looseName(row)} · {row.metal} · {grams(row.weight)} in stock
                </option>
              ))}
            </SelectField>

            {pricedLoose.length > 0 && (
              <div className="mt-2 divide-y divide-line">
                {pricedLoose.map((line, index) => {
                  const row = looseByKey.get(looseKey(line))!;
                  return (
                    <div key={looseKey(line)} className="space-y-3 py-5 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-fg">{looseName(row)}</p>
                          <p className="text-[13px] text-fg-3">
                            {row.metal} · {grams(row.weight)} in stock
                            {row.piecesPerGram && line.weight > 0 ? ` · about ${Math.round(line.weight * row.piecesPerGram)} pieces on this bill` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-serif text-lg font-medium text-fg tabular-nums">{inr(line.amt)}</p>
                          <button
                            type="button"
                            onClick={() => setLooseLines(looseLines.filter((_, i) => i !== index))}
                            aria-label={`Remove ${looseName(row)}`}
                            title="Remove"
                            className={`-my-1 ${iconButtonClass} hover:text-bad`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <Field
                          label="Weight (g)"
                          type="number"
                          step="0.001"
                          min="0.001"
                          max={row.weight}
                          value={line.weight || ""}
                          onChange={(e) => updateLoose(index, "weight", Number(e.target.value))}
                          required
                        />
                        <Field
                          label="Rate (₹/g at this purity)"
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={line.rate || ""}
                          onChange={(e) => updateLoose(index, "rate", Number(e.target.value))}
                          required
                        />
                        <Field
                          label="Making % (with wastage)"
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.makingPct || ""}
                          onChange={(e) => updateLoose(index, "makingPct", Number(e.target.value))}
                          placeholder="e.g. 12"
                        />
                      </div>
                      <p className="text-[13px] text-fg-3 tabular-nums">
                        Metal {inr(line.metalValue)} · Making {inr(line.makingAmt)} · GST {GST_PCT}% {inr(line.gst)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        <Card
          title="Old metal in exchange"
          hint={oldGold.length === 0 ? "Add old metal the customer is giving against this bill." : undefined}
          action={
            <button type="button" onClick={() => setOldGold([...oldGold, { metal: "Gold", weight: 0, melting: 0, amt: 0 }])} className={btn("secondary", "sm")}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add old item
            </button>
          }
          flush={oldGold.length === 0}
        >
          {oldGold.length === 0 ? <div className="pb-1" /> : (
            <div className="divide-y divide-line">
              {oldGold.map((old, index) => (
                <div key={index} className="grid grid-cols-2 items-end gap-4 py-5 first:pt-0 last:pb-0 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                  <SelectField label="Metal" value={old.metal} onChange={(e) => updateOldGold(index, "metal", e.target.value)}>
                    <option value="Gold">Gold</option>
                    <option value="Silver">Silver</option>
                    <option value="Phuli">Phuli</option>
                  </SelectField>
                  <Field label="Weight (g)" type="number" step="0.001" min="0.001" value={old.weight || ""} onChange={(e) => updateOldGold(index, "weight", Number(e.target.value))} required />
                  <Field label="Melting (%)" type="number" step="0.001" min="0.001" max="100" value={old.melting || ""} onChange={(e) => updateOldGold(index, "melting", Number(e.target.value))} required />
                  <Field label="Agreed value (₹)" type="number" step="0.01" min="0.01" value={old.amt || ""} onChange={(e) => updateOldGold(index, "amt", Number(e.target.value))} placeholder={String(suggestOldValue(old) || "")} required />
                  <div className="col-span-2 flex h-10 items-center justify-between gap-3 md:col-span-1">
                    <button type="button" onClick={() => updateOldGold(index, "amt", suggestOldValue(old))} className={`text-[13px] ${linkClass}`}>
                      Use {inr(suggestOldValue(old))}
                    </button>
                    <button type="button" onClick={() => setOldGold(oldGold.filter((_, i) => i !== index))} aria-label="Remove old item" title="Remove" className={`${iconButtonClass} hover:text-bad`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24">
        <Card title="Payment">
          <div className="space-y-4">
            <Field
              label="Discount (₹)"
              type="number"
              step="0.01"
              min="0"
              max={computedAmt}
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
            <Field
              label="Amount paid now (₹)"
              type="number"
              step="0.01"
              min="0"
              max={toPay}
              value={paidAmt || ""}
              onChange={(e) => setPaidAmt(Number(e.target.value))}
            />
            <SelectField label="Payment mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="cash">Cash (Vault)</option>
              <option value="online">Online (Bank)</option>
            </SelectField>
            <Field
              label="Time of sale"
              type="time"
              value={billTime}
              onChange={(e) => setBillTime(e.target.value)}
              hint="Leave empty for the time now."
            />
            {date && (
              <Field
                label="Payment entered on"
                type="date"
                min={date}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                hint="Leave empty to use the bill date. When this bill replaces a cancelled one, choose the day of the correction, so earlier days stay as they were counted."
              />
            )}

            <dl className="space-y-2 pt-1">
              <SummaryRow label="Computed amount" value={inr(computedAmt)} />
              <SummaryRow label="Discount" value={`− ${inr(discount)}`} />
              <SummaryRow label="Bill total" value={inr(totalAmt)} strong />
              {advance > 0 && <SummaryRow label="Order advance" value={inr(advance)} tone="ok" />}
              {oldGoldAmt > 0 && <SummaryRow label="Old metal" value={inr(oldGoldAmt)} tone="ok" />}
              <SummaryRow label="Paid now" value={inr(paidAmt)} tone="ok" />
              <SummaryRow label="Balance due" value={inr(Math.max(0, balanceDue))} tone={balanceDue > 0 ? "accent" : undefined} />
            </dl>

            {error && <p role="alert" className="text-sm text-bad">{error}</p>}

            <div className="flex flex-col gap-2 pt-1">
              <button type="submit" disabled={loading} className={btn()}>
                {loading ? "Saving..." : "Save sale"}
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
