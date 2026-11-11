"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createSale, editSale } from "@/app/actions/sales";
import { GST_PCT, makingPctFor, priceSaleLine, purityRate, round2, round3 } from "@/lib/pricing";
import { dateOnly, grams, inr, istDate } from "@/lib/format";
import { Card, Field, Notice, SelectField, SummaryRow } from "@/components/ui";
import { PieceSearch } from "@/components/PieceSearch";
import { SearchPicker } from "@/components/SearchPicker";
import { btn, iconButtonClass, linkClass } from "@/lib/styles";

type Customer = { id: string; name: string | null; type: string | null };
type Piece = {
  id: string;
  label: number | null;
  typeName: string | null;
  metal: string | null;
  netWeight: number | null;
  melting: number | null;
  status: string | null;
  grossWeight?: number | null;
  huid?: string | null;
};
type Line = { stockId: string; rate: number; makingPct: number };
// Loose metal (mani) on hand: one choice per type and melting, sold by weight.
type Loose = {
  itemTypeId: string;
  typeName: string | null;
  metal: string | null;
  piecesPerGram: number | null;
  counted: boolean; // kept by piece count as well as weight (phuli, nath)
  melting: number;
  wastage: number; // the lot's purchase terms; together with type and melting they name the lot
  making: number;
  weight: number;
  pieces: number;
};
type LooseLine = { itemTypeId: string; melting: number; wastage: number; making: number; weight: number; pieces: number | null; rate: number; makingPct: number };
const looseKey = (row: { itemTypeId: string; melting: number; wastage: number; making: number }) => `${row.itemTypeId}|${row.melting}|${row.wastage}|${row.making}`;
// A lot is named by its terms: "76% · wastage 4% · making ₹300/g".
const lotTerms = (row: { melting: number; wastage: number; making: number }) =>
  [`${row.melting}%`, row.wastage ? `wastage ${row.wastage}%` : null, row.making ? `making ₹${row.making}/g` : null].filter(Boolean).join(" · ");
const inStock = (row: Loose) => `${row.counted ? `${row.pieces} pcs · ` : ""}${grams(row.weight)} in stock`;
type OldGold = { metal: string; weight: number; melting: number; amt: number };
// A bill opened for correction, as it was entered: the form starts from it.
export type SaleEdit = {
  id: string;
  initial: {
    customerId: string;
    orderId: string;
    lines: Line[];
    looseLines: LooseLine[];
    oldGold: OldGold[];
    bcUse: Record<string, number>;
    fromLend: number;
    discount: number;
    paidAmt: number; // paid along with the bill
    mode: string;
    day: string;
    time: string;
    paymentDate: string;
    laterPaid: number; // received on the bill afterwards; it stays as it is
  };
};
type ReadyOrder = {
  id: string;
  customerId: string | null;
  name: string | null;
  stockIds: string[];
  advance: number;
  bookedRate: number | null;
};
// A customer's BC: a matured one has a balance to spend on the bill; a running one is only shown.
type Bc = {
  id: string;
  customerId: string;
  cardNo: string | null;
  balance: number;
  matured: boolean;
  maturesOn: string;
  monthsPaid: number;
  months: number;
};
// An amount per customer: money the shop holds for them, or what they already owe.
type PerCustomer = { customerId: string; amt: number };

// The line's price with GST. It shows what the rate and making % come to; typing a price instead
// works the making % out from it, so a price agreed with the customer can be entered as it is.
function FinalPriceField({ netWeight, rate, amt, onMakingPct }: {
  netWeight: number;
  rate: number;
  amt: number;
  onMakingPct: (pct: number) => void;
}) {
  // What is being typed; null when not typing, and the field shows the line's own amount.
  const [draft, setDraft] = useState<string | null>(null);
  const typed = draft === null ? null : Number(draft);
  const floor = priceSaleLine({ netWeight, rate, makingPct: 0 }).amt;
  const tooLow = typed !== null && typed > 0 && netWeight > 0 && makingPctFor({ netWeight, rate }, typed) === null;
  return (
    <Field
      label="Final price with GST (₹)"
      type="number"
      step="0.01"
      min="0"
      value={draft ?? (amt || "")}
      onFocus={() => setDraft(amt ? String(amt) : "")}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const pct = makingPctFor({ netWeight, rate }, Number(e.target.value));
        if (pct !== null) onMakingPct(pct);
      }}
      placeholder="Works out making %"
      hint={
        tooLow ? <span className="text-bad">Below metal + GST ({inr(floor)}), so making cannot be worked out.</span>
          : !(netWeight > 0) ? "Enter the weight first."
          // Making % is kept to 3 decimals, so a large piece can land a few paise away.
          : typed !== null && typed > 0 && Math.abs(typed - amt) >= 0.005 ? `Comes to ${inr(amt)}; take the paise off as discount.`
          : undefined
      }
    />
  );
}

export function SaleForm({
  customers,
  pieces,
  loose = [],
  rates,
  orders,
  bcs = [],
  held = [],
  udhari = [],
  date,
  edit,
  onSaved,
  onCancel,
}: {
  customers: Customer[];
  pieces: Piece[];
  loose?: Loose[];
  rates: { Gold: number | null; Silver: number | null };
  orders: ReadyOrder[];
  bcs?: Bc[];
  held?: PerCustomer[]; // on the customer's सावकारी account, which the bill can be paid out of
  udhari?: PerCustomer[]; // earlier bills, loan and repairs, which a payment beyond this bill goes to
  // The bill's own day (YYYY-MM-DD) when the sale is entered later; today if left out.
  date?: string;
  // Given when an existing bill is being corrected (owner only).
  edit?: SaleEdit;
  // Given when the form is shown inside another screen (the day book's popup), which then
  // decides what happens next. Left out, a saved bill opens and Cancel goes back a page.
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = edit?.initial;
  const [customerId, setCustomerId] = useState(start?.customerId ?? "");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const isNewCustomer = customerId === "new";

  const [lines, setLines] = useState<Line[]>(start?.lines ?? []);
  const [looseLines, setLooseLines] = useState<LooseLine[]>(start?.looseLines ?? []);
  const [orderId, setOrderId] = useState(start?.orderId ?? "");
  const [oldGold, setOldGold] = useState<OldGold[]>(start?.oldGold ?? []);
  const [bcUse, setBcUse] = useState<Record<string, number>>(start?.bcUse ?? {});
  // Money held for the customer spent on the bill; null means as much as the bill can take.
  const [lendUse, setLendUse] = useState<number | null>(start ? start.fromLend : null);
  const [discount, setDiscount] = useState(start?.discount ?? 0);
  const [paidAmt, setPaidAmt] = useState(start?.paidAmt ?? 0);
  const [mode, setMode] = useState(start?.mode ?? "cash");
  // For a bill entered later: the day its money goes into the cash book, if not the bill's own day.
  const [paymentDate, setPaymentDate] = useState(start?.paymentDate ?? "");
  // Hidden until asked for, so it is not taken for the bill's own date.
  const [laterPayment, setLaterPayment] = useState(Boolean(start?.paymentDate));
  // The time of the sale on the bill's day. Empty means the time now.
  const [billTime, setBillTime] = useState(start?.time ?? "");
  // A corrected bill can be moved to another day; a new one takes the day it is entered on.
  const [billDay, setBillDay] = useState(start?.day ?? "");
  const [reason, setReason] = useState("");
  const dayShown = edit ? billDay : date;
  const laterPaid = start?.laterPaid ?? 0;

  // Another customer's money held is not theirs to spend: start again from as much as the bill takes.
  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    setLendUse(null);
  };

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
  const looseName = (row: Loose) => `${row.typeName ?? "Loose"} · ${lotTerms(row)}`;
  const looseAvailable = loose.filter((row) => !looseLines.some((line) => looseKey(line) === looseKey(row)));
  const addLoose = (key: string) => {
    const row = looseByKey.get(key);
    if (!row) return;
    const fineRate = row.metal === "Silver" ? rates.Silver : rates.Gold;
    setLooseLines([...looseLines, {
      itemTypeId: row.itemTypeId, melting: row.melting, wastage: row.wastage, making: row.making,
      weight: 0, pieces: row.counted ? 1 : null, rate: purityRate(fineRate ?? 0, row.melting), makingPct: 0,
    }]);
  };
  const updateLoose = (index: number, field: "weight" | "pieces" | "rate" | "makingPct", value: number) => {
    setLooseLines(looseLines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  // Delivering an order: bring in its customer and its piece, priced at the booked rate if there is one.
  const order = orders.find((o) => o.id === orderId);
  const chooseOrder = (id: string) => {
    setOrderId(id);
    const chosen = orders.find((o) => o.id === id);
    if (!chosen) return;
    if (chosen.customerId) chooseCustomer(chosen.customerId);
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
  // Only the chosen customer's BCs count, should the customer be changed after one was used.
  const customerBcs = bcs.filter((row) => row.customerId === customerId);
  const readyBcs = customerBcs.filter((row) => row.matured);
  const bcUsed = readyBcs.map((row) => ({ bcId: row.id, amt: bcUse[row.id] ?? 0 })).filter((use) => use.amt > 0);
  const bcAmt = round2(bcUsed.reduce((sum, use) => sum + use.amt, 0));
  const heldAmt = held.find((row) => row.customerId === customerId)?.amt ?? 0;
  // Payments received on a corrected bill later stay on it, so they come off first.
  const forLend = Math.max(0, round2(totalAmt - advance - oldGoldAmt - bcAmt - laterPaid));
  const fromLend = heldAmt > 0 ? lendUse ?? Math.min(heldAmt, forLend) : 0;
  const owedBefore = udhari.find((row) => row.customerId === customerId)?.amt ?? 0;
  const balanceDue = round2(totalAmt - advance - oldGoldAmt - bcAmt - laterPaid - fromLend - paidAmt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerId) return setError("Choose a customer.");
    if (lines.length === 0 && looseLines.length === 0) return setError("Add at least one piece or loose item to the bill.");
    if (edit && !reason.trim()) return setError("Write what was wrong with the bill.");

    setLoading(true);
    const payload = {
      date: dayShown,
      time: billTime || undefined,
      customerId: isNewCustomer ? undefined : customerId,
      newCustomer: isNewCustomer ? { name: newCustomerName, contact: newCustomerContact } : undefined,
      orderId: orderId || undefined,
      items: lines,
      loose: looseLines,
      oldGold,
      bcs: bcUsed,
      fromLend,
      discount,
      paidAmt,
      mode,
      paymentDate: paymentDate || undefined,
    };
    const res = edit ? await editSale(edit.id, payload, reason) : await createSale(payload);

    if (res.success) {
      if (onSaved) onSaved();
      else {
        router.push(`/sales/${res.id}`);
        router.refresh();
      }
    } else {
      setLoading(false);
      setError(res.error ?? (edit ? "Could not save the corrected bill." : "Failed to create the sale."));
    }
  };

  // What is left for a BC to cover, before what this BC itself covers; then what is left for money.
  // A payment beyond this bill goes to what the customer already owes, as far as it goes.
  const forBc = (id: string) => Math.max(0, round2(totalAmt - advance - oldGoldAmt - bcAmt + (bcUse[id] ?? 0)));
  const toPay = Math.max(0, round2(forLend - fromLend));
  const towardsOld = Math.max(0, round2(paidAmt - toPay));

  // The bill on the left; what it comes to stays in view on the right while the pieces are added.
  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-6">
        {edit && (
          <Notice tone="warn" title="Editing a saved bill">
            Saving puts the bill right everywhere as if it had been entered this way: stock, cash book and the day book of its day.
            {laterPaid > 0 && <> The {inr(laterPaid)} received on it later stays as it was.</>}
          </Notice>
        )}
        {!edit && date && (
          <Notice tone="info">
            This bill, and any payment or old metal on it, will be dated <strong className="font-semibold">{dateOnly(date)}</strong>.
          </Notice>
        )}

        <Card title="Customer">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className={orders.length === 0 && !isNewCustomer ? "sm:col-span-2" : ""}>
              <SearchPicker
                label="Customer"
                items={customers}
                itemKey={(customer) => customer.id}
                itemText={(customer) => `${customer.name ?? ""}${customer.type === "staff" ? " staff" : ""}`}
                renderItem={(customer) => (
                  <span className={`min-w-0 flex-1 truncate ${customer.id === customerId ? "font-medium text-fg" : "text-fg"}`}>
                    {customer.name}
                    {customer.type === "staff" && <span className="text-fg-3"> (staff)</span>}
                  </span>
                )}
                onPick={(customer) => chooseCustomer(customer.id)}
                selected={isNewCustomer ? "New customer" : (customers.find((c) => c.id === customerId)?.name ?? "")}
                extra={{
                  label: "+ Add new customer",
                  onPick: (typed) => {
                    chooseCustomer("new");
                    if (typed) setNewCustomerName(typed);
                  },
                }}
                placeholder="Search a customer by name"
                emptyText="No customer matches."
              />
            </div>

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
          <PieceSearch
            pieces={available}
            onPick={(piece) => addPiece(piece.id)}
            placeholder={available.length === 0 ? "No more pieces available" : "Add a piece: label, type, weight or HUID"}
            emptyText="No piece in stock matches."
          />

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
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
                        step="0.001"
                        min="0"
                        value={line.makingPct || ""}
                        onChange={(e) => updateLine(index, "makingPct", Number(e.target.value))}
                        placeholder="e.g. 12"
                      />
                      <FinalPriceField
                        netWeight={piece.netWeight ?? 0}
                        rate={line.rate}
                        amt={line.amt}
                        onMakingPct={(pct) => updateLine(index, "makingPct", pct)}
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
          <Card title="Loose metal" hint="Mani, phuli, nath and other loose stock, sold by weight out of one lot. Phuli and nath are counted in pieces too.">
            <SearchPicker
              items={looseAvailable}
              itemKey={looseKey}
              itemText={(row) => `${looseName(row)} ${row.metal ?? ""}`}
              renderItem={(row) => (
                <>
                  <span className="min-w-0 flex-1 truncate text-fg">
                    <span className="font-medium">{row.typeName ?? "Loose"}</span>
                    <span className="text-fg-3"> · {lotTerms(row)} · {row.metal ?? "-"}</span>
                  </span>
                  <span className="text-fg-2 tabular-nums">{inStock(row)}</span>
                </>
              )}
              onPick={(row) => addLoose(looseKey(row))}
              placeholder={looseAvailable.length === 0 ? "No more loose metal available" : "Add loose metal: type, melting or metal"}
              emptyText="No loose metal in stock matches."
            />

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
                            {row.metal} · {inStock(row)}
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
                      <div className={`grid grid-cols-2 gap-4 ${row.counted ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
                        {row.counted && (
                          <Field
                            label="Pieces"
                            type="number"
                            step="1"
                            min="1"
                            max={row.pieces}
                            value={line.pieces || ""}
                            onChange={(e) => updateLoose(index, "pieces", Number(e.target.value))}
                            hint={line.pieces === row.pieces ? "The last of this lot: a small leftover weight is written off." : undefined}
                            required
                          />
                        )}
                        <Field
                          label="Weight (g)"
                          type="number"
                          step="0.001"
                          min="0.001"
                          max={row.counted && line.pieces === row.pieces ? round3(row.weight + 0.05) : row.weight}
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
                          step="0.001"
                          min="0"
                          value={line.makingPct || ""}
                          onChange={(e) => updateLoose(index, "makingPct", Number(e.target.value))}
                          placeholder="e.g. 12"
                        />
                        <FinalPriceField
                          netWeight={line.weight}
                          rate={line.rate}
                          amt={line.amt}
                          onMakingPct={(pct) => updateLoose(index, "makingPct", pct)}
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
            {customerBcs.map((row) => {
              const name = `BC${row.cardNo ? ` card ${row.cardNo}` : ""}`;
              if (!row.matured) {
                return (
                  <Notice key={row.id} tone="info">
                    {name}: {row.monthsPaid} of {row.months} instalments paid. It can be used from {dateOnly(row.maturesOn)}.{" "}
                    <a href={`/bc/${row.id}`} target="_blank" rel="noreferrer" className={linkClass}>Open</a>
                  </Notice>
                );
              }
              const most = Math.min(row.balance, forBc(row.id));
              return (
                <Field
                  key={row.id}
                  label={`From ${name} (₹)`}
                  type="number"
                  step="0.01"
                  min="0"
                  max={most}
                  value={bcUse[row.id] || ""}
                  onChange={(e) => setBcUse({ ...bcUse, [row.id]: Number(e.target.value) })}
                  hint={
                    <>
                      {inr(row.balance)} left on it.{" "}
                      {most > 0 && (bcUse[row.id] ?? 0) !== most && (
                        <button type="button" onClick={() => setBcUse({ ...bcUse, [row.id]: most })} className={linkClass}>Use {inr(most)}</button>
                      )}
                    </>
                  }
                />
              );
            })}
            {heldAmt > 0 && (
              <Field
                label="From money the shop holds (₹)"
                type="number"
                step="0.01"
                min="0"
                max={Math.min(heldAmt, forLend)}
                value={fromLend || ""}
                onChange={(e) => setLendUse(Number(e.target.value))}
                hint={`${inr(heldAmt)} held for this customer (सावकारी). Set 0 to keep it held.`}
              />
            )}
            <Field
              label={edit ? "Amount paid with the bill (₹)" : "Amount paid now (₹)"}
              type="number"
              step="0.01"
              min="0"
              max={round2(toPay + owedBefore)}
              value={paidAmt || ""}
              onChange={(e) => setPaidAmt(Number(e.target.value))}
              hint={owedBefore > 0 ? `The customer already owes ${inr(owedBefore)} (earlier bills, loan, repairs). Anything paid beyond this bill goes to that, oldest first.` : undefined}
            />
            <SelectField label="Payment mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="cash">Cash (Vault)</option>
              <option value="online">Online (Bank)</option>
            </SelectField>
            {edit && (
              <Field
                label="Bill date"
                type="date"
                max={istDate()}
                value={billDay}
                onChange={(e) => setBillDay(e.target.value)}
                required
              />
            )}
            <Field
              label="Time of sale"
              type="time"
              value={billTime}
              onChange={(e) => setBillTime(e.target.value)}
              hint={edit ? undefined : "Leave empty for the time now."}
              required={Boolean(edit)}
            />
            {dayShown && !laterPayment && (
              <button type="button" onClick={() => setLaterPayment(true)} className={`text-[13px] ${linkClass}`}>
                Money received on a later day than the bill?
              </button>
            )}
            {dayShown && laterPayment && (
              <Field
                label="Money received on (not the bill date)"
                type="date"
                min={dayShown}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                hint="Leave empty to use the bill date. When this bill replaces a cancelled one, choose the day of the correction, so earlier days stay as they were counted."
              />
            )}
            {dayShown && paymentDate && paymentDate !== dayShown && paidAmt > 0 && (
              <Notice tone="warn">
                The bill is dated {dateOnly(dayShown)} but the money goes in on {dateOnly(paymentDate)}, so on {dateOnly(dayShown)} this bill shows as उधारी.
                {edit
                  ? <> If the sale was really on {dateOnly(paymentDate)}, change the bill date instead.</>
                  : <> If the sale was really on {dateOnly(paymentDate)}, close this and enter it from that day&apos;s day book instead.</>}
              </Notice>
            )}

            <dl className="space-y-2 pt-1">
              <SummaryRow label="Computed amount" value={inr(computedAmt)} />
              <SummaryRow label="Discount" value={`− ${inr(discount)}`} />
              <SummaryRow label="Bill total" value={inr(totalAmt)} strong />
              {advance > 0 && <SummaryRow label="Order advance" value={inr(advance)} tone="ok" />}
              {oldGoldAmt > 0 && <SummaryRow label="Old metal" value={inr(oldGoldAmt)} tone="ok" />}
              {bcAmt > 0 && <SummaryRow label="From BC" value={inr(bcAmt)} tone="ok" />}
              {fromLend > 0 && <SummaryRow label="From money held" value={inr(fromLend)} tone="ok" />}
              {laterPaid > 0 && <SummaryRow label="Paid later (stays)" value={inr(laterPaid)} tone="ok" />}
              <SummaryRow label={edit ? "Paid with the bill" : "Paid now"} value={inr(paidAmt)} tone="ok" />
              {towardsOld > 0 && <SummaryRow label="Of it, towards what is owed" value={inr(towardsOld)} />}
              <SummaryRow label="Balance due" value={inr(Math.max(0, balanceDue))} tone={balanceDue > 0 ? "accent" : undefined} />
            </dl>

            {edit && (
              <Field
                label="What was wrong"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Entered on the wrong day"
                hint="Kept with the bill as it was before, in the audit log."
                required
              />
            )}

            {error && <p role="alert" className="text-sm text-bad">{error}</p>}

            <div className="flex flex-col gap-2 pt-1">
              <button type="submit" disabled={loading} className={btn()}>
                {loading ? "Saving..." : edit ? "Save corrected bill" : "Save sale"}
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
