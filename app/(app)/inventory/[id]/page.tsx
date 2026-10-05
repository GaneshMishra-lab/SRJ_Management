import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import {
  bill,
  itemApproval,
  itemPurchased,
  itemSale,
  itemSaleBill,
  itemStock,
  itemType,
  langdiLedger,
  supplierReturn,
  supplierReturnSettlement,
} from "@/db/schema/sales";
import { creditSupplierReturn, meltItem, returnFromApproval, returnToSupplier, sendOnApproval, settleSupplierReturn, settleSupplierReturnFine } from "@/app/actions/stock";
import { DateField, Grams, Rupees, SelectField } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateTime, grams, inr } from "@/lib/format";
import { round2, round3 } from "@/lib/pricing";
import { STANDARD_PURITY, Standard } from "@/lib/standards";
import { cardClass, inputClass, labelClass, stockStatus } from "@/lib/styles";

export default async function StockPiecePage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [piece] = await db
    .select({
      stock: itemStock,
      typeName: itemType.name,
      purchase: itemPurchased,
      billId: bill.id,
      billDate: bill.date,
      billStandard: bill.standard,
      supplierName: entity.name,
    })
    .from(itemStock)
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .leftJoin(itemPurchased, eq(itemStock.item, itemPurchased.id))
    .leftJoin(bill, eq(itemPurchased.bill, bill.id))
    .leftJoin(entity, eq(bill.supplier, entity.id))
    .where(eq(itemStock.id, id));
  if (!piece) notFound();

  const approvals = await db
    .select({ approval: itemApproval, holderName: entity.name })
    .from(itemApproval)
    .leftJoin(entity, eq(itemApproval.entity, entity.id))
    .where(eq(itemApproval.item, id))
    .orderBy(asc(itemApproval.dateOut));

  // A piece can be billed more than once if an earlier bill was cancelled.
  const sales = await db
    .select({ billId: itemSaleBill.id, date: itemSaleBill.date, cancelledAt: itemSaleBill.cancelledAt, amt: itemSale.amt, customerName: entity.name })
    .from(itemSale)
    .innerJoin(itemSaleBill, eq(itemSale.bill, itemSaleBill.id))
    .leftJoin(entity, eq(itemSaleBill.customer, entity.id))
    .where(eq(itemSale.item, id))
    .orderBy(asc(itemSaleBill.createdAt));

  const [ret] = await db.select().from(supplierReturn).where(eq(supplierReturn.item, id));
  const [settlement] = ret
    ? await db
        .select({ settled: sql<number>`coalesce(sum(${supplierReturnSettlement.amt}), 0)`.mapWith(Number) })
        .from(supplierReturnSettlement)
        .where(eq(supplierReturnSettlement.supplierReturn, ret.id))
    : [];
  const supplierRet = ret ? { ret, settled: settlement?.settled ?? 0 } : undefined;

  // The supplier's unpaid bills, which a return can be credited against.
  const openBills = ret
    ? await db
        .select({ id: bill.id, date: bill.date, billAmt: bill.billAmt, paidAmt: bill.paidAmt })
        .from(bill)
        .where(and(eq(bill.supplier, ret.supplier), sql`coalesce(${bill.paidAmt}, 0) < coalesce(${bill.billAmt}, 0)`))
        .orderBy(asc(bill.date))
    : [];

  const [melt] = piece.stock.langdiEntry
    ? await db.select().from(langdiLedger).where(eq(langdiLedger.id, piece.stock.langdiEntry))
    : [];

  const holders = await db
    .select({ id: entity.id, name: entity.name, type: entity.type })
    .from(entity)
    .where(inArray(entity.type, ["customer", "supplier"]))
    .orderBy(asc(entity.name));

  const s = piece.stock;
  const status = stockStatus[s.status ?? ""];
  const openApproval = approvals.find((a) => !a.approval.dateBack);

  // What the supplier charged for this piece, as the starting point for a return.
  const purity = STANDARD_PURITY[(piece.billStandard ?? "995") as Standard] ?? 99.5;
  const purchaseFine = piece.purchase
    ? round3(((s.netWeight ?? 0) * ((s.melting ?? 0) + (piece.purchase.wastage ?? 0))) / purity)
    : 0;
  const returnDue = supplierRet ? round2((supplierRet.ret.amt ?? 0) - supplierRet.settled) : 0;

  const timeline: { when: string | null; text: React.ReactNode }[] = [];
  if (piece.purchase) {
    timeline.push({
      when: piece.billDate,
      text: <>Bought from {piece.supplierName ?? "supplier"} for {inr(piece.purchase.amt)} (<Link href={`/purchases/${piece.billId}`} className="text-amber-500 hover:text-amber-400">bill</Link>)</>,
    });
  } else {
    timeline.push({ when: s.date, text: "Added to stock as a refurbished old item" });
  }
  for (const { approval, holderName } of approvals) {
    timeline.push({ when: approval.dateOut, text: `Sent on approval to ${holderName ?? "unknown"}${approval.note ? ` (${approval.note})` : ""}` });
    if (approval.dateBack) {
      timeline.push({ when: approval.dateBack, text: approval.outcome === "sold" ? "Approval ended in a sale" : "Came back from approval" });
    }
  }
  for (const sale of sales) {
    timeline.push({
      when: sale.date,
      text: <>Sold to {sale.customerName ?? "customer"} for {inr(sale.amt)} (<Link href={`/sales/${sale.billId}`} className="text-amber-500 hover:text-amber-400">bill</Link>)</>,
    });
    if (sale.cancelledAt) {
      timeline.push({ when: sale.cancelledAt, text: "That sale bill was cancelled; the piece came back into stock" });
    }
  }
  if (supplierRet) {
    timeline.push({ when: supplierRet.ret.date, text: `Returned to supplier at ${inr(supplierRet.ret.amt)} / ${grams(supplierRet.ret.fine)} fine` });
  }
  if (melt) {
    timeline.push({ when: melt.date, text: `Melted into langdi: ${grams(melt.weight)} at about ${melt.estPurity}% purity` });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-zinc-500 hover:text-zinc-300">← Inventory</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            {piece.typeName ?? "Piece"} #{s.label ?? "-"}
          </h1>
          {status && (
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { name: "Metal", value: s.metal ?? "-" },
          { name: "Gross weight", value: grams(s.grossWeight) },
          { name: "Net weight", value: grams(s.netWeight) },
          { name: "Melting", value: `${s.melting ?? 0}%` },
          { name: "HUID", value: s.huid ?? "-" },
        ].map((stat) => (
          <div key={stat.name} className={cardClass}>
            <p className="text-sm text-zinc-400">{stat.name}</p>
            <p className="mt-1 text-base sm:text-xl font-semibold text-zinc-100 break-words">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">History</h2>
        <ul className="space-y-3 text-sm">
          {timeline.map((event, index) => (
            <li key={index} className="flex flex-col sm:flex-row sm:gap-4">
              <span className="shrink-0 text-zinc-500 sm:w-44">{dateTime(event.when)}</span>
              <span className="text-zinc-300">{event.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {s.status === "stock" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={cardClass}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Send on approval</h2>
            <p className="text-sm text-zinc-500 mb-4">The piece leaves the shop unsold.</p>
            <ActionForm action={sendOnApproval.bind(null, id)} submitLabel="Send out">
              <div className="space-y-2">
                <label htmlFor="entity" className={labelClass}>Taken by</label>
                <select id="entity" name="entity" className={inputClass} defaultValue="">
                  <option value="">Select...</option>
                  {holders.map((holder) => (
                    <option key={holder.id} value={holder.id}>{holder.name} ({holder.type})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="newName" className={labelClass}>Or a new customer</label>
                <input id="newName" name="newName" type="text" placeholder="Name" className={inputClass} />
                <input name="newContact" type="tel" placeholder="Contact number (optional)" aria-label="New customer contact number" className={inputClass} />
              </div>
              <div className="space-y-2">
                <label htmlFor="note" className={labelClass}>Note (optional)</label>
                <input id="note" name="note" type="text" className={inputClass} />
              </div>
              <DateField />
            </ActionForm>
          </div>

          {piece.purchase && (
            <div className={cardClass}>
              <h2 className="text-lg font-semibold text-zinc-100 mb-1">Return to supplier</h2>
              <p className="text-sm text-zinc-500 mb-4">The purchase bill stays as it is; the return is settled separately.</p>
              <ActionForm action={returnToSupplier.bind(null, id)} submitLabel="Return piece">
                <div className="space-y-2">
                  <label htmlFor="ret-amt" className={labelClass}>Value taken back (₹)</label>
                  <input id="ret-amt" name="amt" type="number" step="0.01" min="0.01" defaultValue={piece.purchase.amt ?? undefined} className={inputClass} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="ret-fine" className={labelClass}>Fine weight (g)</label>
                  <input id="ret-fine" name="fine" type="number" step="0.001" min="0" defaultValue={purchaseFine} className={inputClass} />
                </div>
                <DateField />
              </ActionForm>
            </div>
          )}

          <div className={cardClass}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Melt</h2>
            <p className="text-sm text-zinc-500 mb-4">The piece becomes langdi. This cannot be undone.</p>
            <ActionForm action={meltItem.bind(null, id)} submitLabel="Melt piece">
              <div className="space-y-2">
                <label htmlFor="melt-weight" className={labelClass}>Melted weight (g)</label>
                <input id="melt-weight" name="weight" type="number" step="0.001" min="0.001" defaultValue={s.netWeight ?? undefined} className={inputClass} required />
              </div>
              <div className="space-y-2">
                <label htmlFor="melt-purity" className={labelClass}>Estimated purity (%)</label>
                <input id="melt-purity" name="estPurity" type="number" step="0.001" min="0.001" max="100" defaultValue={s.melting ?? undefined} className={inputClass} required />
              </div>
              <DateField />
            </ActionForm>
          </div>
        </div>
      )}

      {s.status === "on_approval" && (
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">Out on approval</h2>
          <p className="text-sm text-zinc-400 mb-4">
            With {openApproval?.holderName ?? "unknown"} since {dateTime(openApproval?.approval.dateOut)}.
            If they buy it, add it to a <Link href="/sales/new" className="text-amber-500 hover:text-amber-400">new sale</Link>.
          </p>
          <ActionForm action={returnFromApproval.bind(null, id)} submitLabel="Piece came back">
            <div className="max-w-xs"><DateField label="Came back on (today if left empty)" /></div>
          </ActionForm>
        </div>
      )}

      {supplierRet && (
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">Supplier return</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Value {inr(supplierRet.ret.amt)} · settled {inr(supplierRet.settled)} · still owed by supplier {inr(returnDue)}
          </p>
          {returnDue > 0 && (
            <ActionForm action={settleSupplierReturn.bind(null, supplierRet.ret.id)} submitLabel="Record money received">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <label htmlFor="settle-amt" className={labelClass}>Amount (₹)</label>
                  <input id="settle-amt" name="amt" type="number" step="0.01" min="0.01" max={returnDue} className={inputClass} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="settle-mode" className={labelClass}>Received in</label>
                  <select id="settle-mode" name="mode" className={inputClass}>
                    <option value="cash">Cash (Vault)</option>
                    <option value="online">Online (Bank)</option>
                  </select>
                </div>
              </div>
              <DateField />
            </ActionForm>
          )}
          {returnDue > 0 && (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-zinc-800 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-3">Or received in fine</h3>
                <ActionForm action={settleSupplierReturnFine.bind(null, supplierRet.ret.id)} submitLabel="Record fine received">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Grams label="Fine weight (g)" name="weight" required />
                    <SelectField label="Standard" name="standard" options={["995", "999"]} />
                  </div>
                  <DateField />
                </ActionForm>
              </div>
              {openBills.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Or credit against an unpaid bill</h3>
                  <ActionForm action={creditSupplierReturn.bind(null, supplierRet.ret.id)} submitLabel="Apply credit">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <SelectField
                        label="Bill"
                        name="bill"
                        options={openBills.map((open) => ({
                          value: open.id,
                          label: `${dateTime(open.date)} · due ${inr((open.billAmt ?? 0) - (open.paidAmt ?? 0))}`,
                        }))}
                      />
                      <Rupees label="Amount (₹)" name="amt" max={returnDue} required />
                    </div>
                    <DateField />
                  </ActionForm>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
