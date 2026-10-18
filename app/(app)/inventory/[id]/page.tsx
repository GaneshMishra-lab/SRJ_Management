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
import { Card, DateField, Field, Grams, PageHeader, Percent, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateTime, grams, inr } from "@/lib/format";
import { round2, round3 } from "@/lib/pricing";
import { STANDARD_PURITY, Standard } from "@/lib/standards";
import { inputClass, linkClass, stockStatus } from "@/lib/styles";

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
  // A piece already in the shop when the books were opened has a purchased item but no bill behind it.
  const opening = Boolean(piece.purchase) && !piece.billId;
  if (opening) {
    timeline.push({ when: s.date, text: "In stock when the books were opened" });
  } else if (piece.purchase) {
    timeline.push({
      when: piece.billDate,
      text: <>Bought from {piece.supplierName ?? "supplier"} for {inr(piece.purchase.amt)} (<Link href={`/purchases/${piece.billId}`} className={linkClass}>bill</Link>)</>,
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
      text: <>Sold to {sale.customerName ?? "customer"} for {inr(sale.amt)} (<Link href={`/sales/${sale.billId}`} className={linkClass}>bill</Link>)</>,
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
      <PageHeader
        back={{ href: "/inventory", label: "Inventory" }}
        title={<>{piece.typeName ?? "Piece"} #{s.label ?? "-"}{status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}</>}
        subtitle={opening ? "Opening stock" : piece.purchase ? `Bought from ${piece.supplierName ?? "a supplier"}` : "Refurbished from old metal"}
      />

      <Stats items={[
        { name: "Metal", value: s.metal ?? "-" },
        { name: "Gross weight", value: grams(s.grossWeight) },
        { name: "Net weight", value: grams(s.netWeight) },
        { name: "Melting", value: `${s.melting ?? 0}%` },
        { name: "HUID", value: s.huid ?? "-" },
      ]} />

      <Card title="History">
        <ol>
          {timeline.map((event, index) => (
            <li
              key={index}
              className="relative pb-5 pl-6 before:absolute before:top-[0.45rem] before:left-0 before:h-2 before:w-2 before:rounded-full before:bg-fg-4 after:absolute after:top-5 after:bottom-0 after:left-[3.5px] after:w-px after:bg-line last:pb-0 last:after:hidden"
            >
              <p className="text-sm text-fg">{event.text}</p>
              <p className="text-[13px] text-fg-3">{dateTime(event.when)}</p>
            </li>
          ))}
        </ol>
      </Card>

      {s.status === "stock" && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <Card title="Send on approval" hint="The piece leaves the shop unsold.">
            <ActionForm action={sendOnApproval.bind(null, id)} submitLabel="Send out">
              <SelectField
                label="Taken by"
                name="entity"
                defaultValue=""
                options={[{ value: "", label: "Select..." }, ...holders.map((holder) => ({ value: holder.id, label: `${holder.name} (${holder.type})` }))]}
              />
              <div className="space-y-2">
                <Field label="Or a new customer" name="newName" type="text" placeholder="Name" />
                <input name="newContact" type="tel" placeholder="Contact number (optional)" aria-label="New customer contact number" className={inputClass} />
              </div>
              <Field label="Note (optional)" name="note" type="text" />
              <DateField />
            </ActionForm>
          </Card>

          {piece.purchase && !opening && (
            <Card title="Return to supplier" hint="The purchase bill stays as it is; the return is settled separately.">
              <ActionForm action={returnToSupplier.bind(null, id)} submitLabel="Return piece">
                <Rupees label="Value taken back (₹)" name="amt" defaultValue={piece.purchase.amt ?? undefined} required />
                <Field label="Fine weight (g)" name="fine" type="number" step="0.001" min="0" defaultValue={purchaseFine} />
                <DateField />
              </ActionForm>
            </Card>
          )}

          <Card title="Melt" hint="The piece becomes langdi. This cannot be undone.">
            <ActionForm action={meltItem.bind(null, id)} submitLabel="Melt piece" tone="danger">
              <Grams label="Melted weight (g)" name="weight" defaultValue={s.netWeight ?? undefined} required />
              <Percent label="Estimated purity (%)" name="estPurity" min="0.001" defaultValue={s.melting ?? undefined} required />
              <DateField />
            </ActionForm>
          </Card>
        </div>
      )}

      {s.status === "on_approval" && (
        <Card
          title="Out on approval"
          hint={
            <>
              With {openApproval?.holderName ?? "unknown"} since {dateTime(openApproval?.approval.dateOut)}.
              If they buy it, add it to a <Link href="/sales/new" className={linkClass}>new sale</Link>.
            </>
          }
        >
          <ActionForm action={returnFromApproval.bind(null, id)} submitLabel="Piece came back">
            <DateField label="Came back on (today if left empty)" />
          </ActionForm>
        </Card>
      )}

      {supplierRet && (
        <Card
          title="Supplier return"
          hint={`Value ${inr(supplierRet.ret.amt)} · settled ${inr(supplierRet.settled)} · still owed by supplier ${inr(returnDue)}`}
        >
          {returnDue <= 0 ? (
            <p className="text-sm text-fg-3">This return is fully settled.</p>
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-fg">Money received</h3>
                <ActionForm action={settleSupplierReturn.bind(null, supplierRet.ret.id)} submitLabel="Record money">
                  <Rupees label="Amount (₹)" name="amt" max={returnDue} required />
                  <SelectField label="Received in" name="mode" options={[{ value: "cash", label: "Cash (Vault)" }, { value: "online", label: "Online (Bank)" }]} />
                  <DateField />
                </ActionForm>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-fg">Received in fine</h3>
                <ActionForm action={settleSupplierReturnFine.bind(null, supplierRet.ret.id)} submitLabel="Record fine">
                  <Grams label="Fine weight (g)" name="weight" required />
                  <SelectField label="Standard" name="standard" options={["995", "999"]} />
                  <DateField />
                </ActionForm>
              </div>
              {openBills.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-fg">Credit against an unpaid bill</h3>
                  <ActionForm action={creditSupplierReturn.bind(null, supplierRet.ret.id)} submitLabel="Apply credit">
                    <SelectField
                      label="Bill"
                      name="bill"
                      options={openBills.map((open) => ({
                        value: open.id,
                        label: `${dateTime(open.date)} · due ${inr((open.billAmt ?? 0) - (open.paidAmt ?? 0))}`,
                      }))}
                    />
                    <Rupees label="Amount (₹)" name="amt" max={returnDue} required />
                    <DateField />
                  </ActionForm>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
