import "server-only";
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { entity } from "@/db/schema/entities";
import { bc, lendEntry, loanEntry } from "@/db/schema/finance";
import { cashLedger } from "@/db/schema/ledger";
import {
  itemApproval,
  itemOrder,
  itemPurchased,
  itemRepairingPayment,
  itemSale,
  itemSaleBill,
  itemSaleDetails,
  itemStock,
  itemType,
  looseStockLedger,
  oldItem,
  oldItemPayment,
} from "@/db/schema/sales";
import { bcTotals } from "@/lib/bc";
import { logAudit } from "@/lib/dal";
import type { Tx } from "@/lib/entities";
import { entryDate, isUuid, UserError } from "@/lib/form";
import { inr, parseDbDate } from "@/lib/format";
import { isCashMode, locationFor, recordCash } from "@/lib/ledger";
import { closeEmptyLot, looseBalances, lotKey, lotTerms, recordLoose, WRITE_OFF_LIMIT } from "@/lib/loose";
import { priceSaleLine, purityRate, round2, round3 } from "@/lib/pricing";
import { heldFor, payOldDues } from "@/lib/sale-payments";

// Writing a sale bill, for a new bill and for one being corrected. A correction first takes the
// bill's own effects back out (unwriteSale), then writes it again under the same id (writeSale),
// so a corrected bill is exactly what a new bill entered that way would have been.

export type SalePayload = {
  date?: string; // the bill's own day (YYYY-MM-DD) when it is entered later; today if left out
  time?: string; // the time on that day (HH:MM); the time now if left out
  customerId?: string;
  newCustomer?: { name: string; contact?: string };
  // Delivering an order: its piece must be on the bill and its advance is applied.
  orderId?: string;
  items: Array<{ stockId: string; rate: number; makingPct: number }>;
  // Loose stock sold by weight out of one lot (type, melting, wastage, making); pieces too for a counted type.
  loose?: Array<{ itemTypeId: string; melting: number; wastage: number; making: number; weight: number; pieces?: number | null; rate: number; makingPct: number }>;
  // Old metal the customer gives in exchange, set against the bill.
  oldGold?: Array<{ metal: string; weight: number; melting: number; amt: number }>;
  // Matured BCs of the customer spent on the bill, and how much of each.
  bcs?: Array<{ bcId: string; amt: number }>;
  // Money the shop holds for the customer (their सावकारी account), spent on the bill.
  fromLend?: number;
  discount: number;
  // What the customer pays now. Beyond what this bill needs, it pays what they already owe, oldest first.
  paidAmt: number;
  mode: string;
  // The day the money is entered in the cash book, when later than the bill's own day:
  // a corrected bill replacing a cancelled one takes its payment on the day of correction.
  paymentDate?: string;
};

// Checks what the form sent, before anything is read or written.
export function parseSale(payload: SalePayload) {
  const stockIds = payload.items.map((item) => item.stockId);
  const loose = (payload.loose ?? []).map((line) => ({
    itemTypeId: line.itemTypeId,
    melting: round3(line.melting),
    wastage: round3(line.wastage || 0),
    making: round2(line.making || 0),
    weight: round3(line.weight),
    pieces: line.pieces ?? null,
    rate: round2(line.rate),
    makingPct: line.makingPct,
  }));
  if (stockIds.length === 0 && loose.length === 0) throw new UserError("Add at least one piece or loose item to the bill.");
  if (new Set(stockIds).size !== stockIds.length || !stockIds.every(isUuid)) {
    throw new UserError("A piece is listed twice or is not valid.");
  }
  if (payload.items.some((item) => !(item.rate > 0) || !(item.makingPct >= 0))) {
    throw new UserError("Every piece needs a rate above zero and a making % of zero or more.");
  }
  if (loose.some((line) => !isUuid(line.itemTypeId) || !(line.weight > 0) || !(line.rate > 0) || !(line.makingPct >= 0))) {
    throw new UserError("Every loose item needs a weight and a rate above zero, and a making % of zero or more.");
  }
  if (loose.some((line) => line.pieces !== null && !(Number.isInteger(line.pieces) && line.pieces > 0))) {
    throw new UserError("Pieces sold must be a whole number above zero.");
  }
  if (new Set(loose.map(lotKey)).size !== loose.length) {
    throw new UserError("A loose item is listed twice. Put its whole weight on one line.");
  }
  const discount = round2(payload.discount || 0);
  const paidAmt = round2(payload.paidAmt || 0);
  const fromLend = round2(payload.fromLend || 0);
  if (discount < 0 || paidAmt < 0 || fromLend < 0) throw new UserError("Discount and amounts paid cannot be negative.");
  if (paidAmt > 0 && !isCashMode(payload.mode)) throw new UserError("Choose how the customer paid.");

  const oldGold = (payload.oldGold ?? []).map((old) => ({
    metal: old.metal,
    weight: round3(old.weight),
    melting: round3(old.melting),
    amt: round2(old.amt),
  }));
  if (oldGold.some((old) => !["Gold", "Silver", "Phuli"].includes(old.metal) || old.weight <= 0 || old.amt <= 0 || old.melting <= 0 || old.melting > 100)) {
    throw new UserError("Each old item needs a metal, weight, melting and agreed value.");
  }
  if (payload.orderId && !isUuid(payload.orderId)) throw new UserError("Order not found.");
  const bcs = (payload.bcs ?? []).map((use) => ({ bcId: use.bcId, amt: round2(use.amt) })).filter((use) => use.amt !== 0);
  if (bcs.some((use) => !isUuid(use.bcId) || !(use.amt > 0)) || new Set(bcs.map((use) => use.bcId)).size !== bcs.length) {
    throw new UserError("A BC on this bill is not valid.");
  }
  // The bill, old metal taken in and any payment made with it all carry the bill's own date.
  const date = entryDate(payload.date, payload.time);
  const paidOn = payload.paymentDate ? entryDate(payload.paymentDate) : date;
  if (parseDbDate(paidOn) < parseDbDate(date)) throw new UserError("The payment date cannot be before the bill date.");

  return { ...payload, stockIds, loose, discount, paidAmt, fromLend, oldGold, bcs, date, paidOn };
}
export type ParsedSale = ReturnType<typeof parseSale>;

// For a bill being corrected: its id, when it was first written (rows written with it keep that
// time, which is how they are told from later payments), and the later payments, which stay.
export type Rewrite = { id: string; createdAt: Date; laterPaid: number; firstLater: string | null };

// Writes the bill and everything that goes with it. Returns the bill's id and what it set aside.
export async function writeSale(tx: Tx, userId: number, sale: ParsedSale, rewrite?: Rewrite) {
  const { stockIds, loose, discount, paidAmt, fromLend, oldGold, bcs, date, paidOn } = sale;
  const createdAt = rewrite?.createdAt;
  if (rewrite?.firstLater && parseDbDate(rewrite.firstLater) < parseDbDate(date)) {
    throw new UserError("A later payment on this bill was received before that date. Choose a bill date on or before it.");
  }

  let customerId = sale.customerId;
  if (!customerId) {
    const name = sale.newCustomer?.name.trim();
    if (!name) throw new UserError("Choose a customer or enter a new customer's name.");
    const [customer] = await tx.insert(entity).values({
      name,
      type: "customer",
      contact: sale.newCustomer?.contact?.trim() || null,
    }).returning();
    await logAudit(tx, userId, { tableName: "entity", recordId: customer.id, action: "insert", newValues: customer });
    customerId = customer.id;
  }

  // Claim the pieces; only ones in the shop or out on approval can be sold.
  const sold = stockIds.length === 0 ? [] : await tx.update(itemStock)
    .set({ status: "sold", updatedAt: new Date() })
    .where(and(inArray(itemStock.id, stockIds), inArray(itemStock.status, ["stock", "on_approval"])))
    .returning({ id: itemStock.id, netWeight: itemStock.netWeight, melting: itemStock.melting });
  if (sold.length !== stockIds.length) {
    throw new UserError("One of these pieces is no longer available. Reload and try again.");
  }
  if (stockIds.length > 0) {
    await tx.update(itemApproval)
      .set({ dateBack: date, outcome: "sold", updatedAt: new Date() })
      .where(and(inArray(itemApproval.item, stockIds), isNull(itemApproval.dateBack)));
  }
  const pieces = new Map(sold.map((piece) => [piece.id, piece]));

  // Loose metal: lock its types so two bills cannot both sell the same grams, then check what is there.
  if (loose.length > 0) {
    const typeIds = [...new Set(loose.map((line) => line.itemTypeId))];
    const types = await tx.select({ id: itemType.id, name: itemType.name, counted: itemType.counted }).from(itemType)
      .where(and(inArray(itemType.id, typeIds), eq(itemType.loose, true)))
      .for("update");
    const onHand = await looseBalances(tx, typeIds);
    for (const line of loose) {
      const type = types.find((row) => row.id === line.itemTypeId);
      if (!type) throw new UserError("A loose item on this bill is not valid.");
      const lot = onHand.find((row) => lotKey(row) === lotKey(line));
      const have = lot?.weight ?? 0;
      const name = `${type.name} (${lotTerms(line)})`;
      if (type.counted) {
        if (!line.pieces) throw new UserError(`Enter how many pieces of ${name} are sold.`);
        if (line.pieces > (lot?.pieces ?? 0)) throw new UserError(`Only ${Math.max(0, lot?.pieces ?? 0)} pieces of ${name} are in stock.`);
      } else line.pieces = null;
      // Selling the last pieces of a lot, the scale may read a little over the book: allow it
      // up to the write-off limit, and the lot is closed at zero after the sale.
      const lastPieces = type.counted && line.pieces === lot?.pieces;
      if (line.weight > have + (lastPieces ? WRITE_OFF_LIMIT : 0) + 0.0005) {
        throw new UserError(`Only ${round3(Math.max(0, have))} g of ${name} is in stock.`);
      }
    }
  }

  // Delivering an order: close it, and price its piece at the booked rate if one was fixed.
  let advance = 0;
  const bookedRates = new Map<string, number>();
  if (sale.orderId) {
    const [order] = await tx.update(itemOrder)
      .set({ status: "dispatched", updatedAt: new Date() })
      .where(and(eq(itemOrder.id, sale.orderId), eq(itemOrder.customer, customerId), ne(itemOrder.status, "dispatched")))
      .returning();
    if (!order) throw new UserError("That order is not this customer's, or is already delivered.");

    const made = await tx
      .select({ id: itemStock.id })
      .from(itemStock)
      .innerJoin(itemPurchased, eq(itemStock.item, itemPurchased.id))
      .where(eq(itemPurchased.order, order.id));
    const onBill = made.filter((piece) => pieces.has(piece.id));
    if (onBill.length === 0) throw new UserError("The piece made for this order must be on the bill.");

    advance = order.amtPaid ?? 0;
    if (order.rateBooked && order.bookedRate) {
      for (const piece of onBill) {
        bookedRates.set(piece.id, purityRate(order.bookedRate, pieces.get(piece.id)?.melting ?? 0));
      }
    }
  }

  const lines = sale.items.map((item) => {
    const rate = bookedRates.get(item.stockId) ?? round2(item.rate);
    return {
      item: item.stockId,
      rate,
      makingPct: item.makingPct,
      ...priceSaleLine({ netWeight: pieces.get(item.stockId)?.netWeight ?? 0, rate, makingPct: item.makingPct }),
    };
  });
  // A loose line is priced the same way, on the weight sold.
  const looseLines = loose.map((line) => ({
    itemType: line.itemTypeId,
    weight: line.weight,
    melting: line.melting,
    lotWastage: line.wastage,
    lotMaking: line.making,
    pieces: line.pieces,
    rate: line.rate,
    makingPct: line.makingPct,
    ...priceSaleLine({ netWeight: line.weight, rate: line.rate, makingPct: line.makingPct }),
  }));

  const computedAmt = round2([...lines, ...looseLines].reduce((sum, line) => sum + line.amt, 0));
  if (discount > computedAmt) throw new UserError("Discount is more than the bill amount.");
  const totalAmt = round2(computedAmt - discount);
  const oldGoldAmt = round2(oldGold.reduce((sum, old) => sum + old.amt, 0));
  // A BC must be this customer's, matured, and have enough left on it. Locked, so two bills
  // cannot spend the same balance.
  for (const use of bcs) {
    const [row] = await tx.select().from(bc).where(eq(bc.id, use.bcId)).for("update");
    if (!row || row.customer !== customerId) throw new UserError("That BC is not this customer's.");
    if (!row.maturedAt) throw new UserError("That BC has not matured yet.");
    const { spent } = await bcTotals(tx, use.bcId);
    if (use.amt > round2((row.value ?? 0) - spent)) throw new UserError("That is more than is left on the BC.");
  }
  const bcAmt = round2(bcs.reduce((sum, use) => sum + use.amt, 0));
  // Money the shop holds for the customer, locked like a BC.
  let lendId: string | null = null;
  if (fromLend > 0) {
    const account = await heldFor(tx, customerId);
    if (fromLend > account.held) throw new UserError(`The shop holds only ${inr(account.held)} for this customer.`);
    lendId = account.lendId;
  }
  const setOff = round2(advance + oldGoldAmt + bcAmt + fromLend);
  // A corrected bill keeps the payments received on it later; it cannot come to less than they do.
  const laterPaid = rewrite?.laterPaid ?? 0;
  if (round2(setOff + laterPaid) > totalAmt) {
    throw new UserError(laterPaid > 0
      ? `Advance, old metal, BC, money held and the ${inr(laterPaid)} paid later on this bill come to more than the bill total.`
      : "Advance, old metal, BC and money held together come to more than the bill total. Buy the old metal separately.");
  }
  // The payment goes to this bill as far as it needs; the rest pays what the customer already owes.
  const paidOnBill = Math.min(paidAmt, round2(totalAmt - setOff - laterPaid));
  const towardsOld = round2(paidAmt - paidOnBill);
  if (rewrite && towardsOld > 0) {
    throw new UserError(`The amount paid is ${inr(towardsOld)} more than is due on this bill. Record money towards other dues on their own pages.`);
  }
  const settled = round2(setOff + paidOnBill);

  const values = { date, customer: customerId, order: sale.orderId ?? null, computedAmt, discount, totalAmt, paidAmt: round2(settled + laterPaid) };
  const [saleBill] = rewrite
    ? await tx.update(itemSaleBill).set({ ...values, updatedAt: new Date() }).where(eq(itemSaleBill.id, rewrite.id)).returning()
    : await tx.insert(itemSaleBill).values(values).returning();

  if (lines.length > 0) await tx.insert(itemSale).values(lines.map((line) => ({ ...line, bill: saleBill.id, createdAt })));
  if (looseLines.length > 0) {
    const soldLoose = await tx.insert(itemSale).values(looseLines.map((line) => ({ ...line, bill: saleBill.id, createdAt }))).returning();
    for (const line of soldLoose) {
      const lot = { itemTypeId: line.itemType!, melting: line.melting ?? 0, wastage: line.lotWastage ?? 0, making: line.lotMaking ?? 0 };
      await recordLoose(tx, {
        itemType: lot.itemTypeId, melting: lot.melting, wastage: lot.wastage, making: lot.making,
        direction: "out", weight: line.weight ?? 0, pieces: line.pieces,
        sourceTable: "item_sale", sourceId: line.id, desc: "Sold on a sale bill", date,
      });
      await closeEmptyLot(tx, lot, date, line.id);
    }
  }

  // None of these moves cash: the advance, the BC's instalments and the money held were
  // recorded when taken, old metal is an exchange.
  if (advance > 0) {
    await tx.insert(itemSaleDetails).values({ sale: saleBill.id, date, amtPaid: advance, mode: "order_advance", createdAt });
  }
  for (const use of bcs) {
    await tx.insert(itemSaleDetails).values({ sale: saleBill.id, date, amtPaid: use.amt, mode: "bc", bc: use.bcId, createdAt });
  }
  if (lendId && fromLend > 0) {
    // Spending it is the shop paying back what it held, in goods.
    await tx.insert(lendEntry).values({ lend: lendId, date, type: "repayment", amt: fromLend, mode: "sale", sale: saleBill.id, createdAt });
    await tx.insert(itemSaleDetails).values({ sale: saleBill.id, date, amtPaid: fromLend, mode: "lend", createdAt });
  }
  for (const old of oldGold) {
    const [row] = await tx.insert(oldItem).values({
      customer: customerId, date, ...old,
      paidAmt: old.amt, saleBill: saleBill.id, status: "vault", createdAt,
    }).returning();
    await tx.insert(itemSaleDetails).values({ sale: saleBill.id, date, amtPaid: old.amt, mode: "old_item", createdAt });
    await logAudit(tx, userId, { tableName: "old_item", recordId: row.id, action: "insert", newValues: row });
  }

  if (paidOnBill > 0 && isCashMode(sale.mode)) {
    const [payment] = await tx.insert(itemSaleDetails).values({
      sale: saleBill.id,
      date: paidOn,
      amtPaid: paidOnBill,
      mode: sale.mode,
      createdAt,
    }).returning();
    await recordCash(tx, {
      direction: "in",
      amt: paidOnBill,
      location: locationFor(sale.mode),
      sourceTable: "item_sale_details",
      sourceId: payment.id,
      desc: "Payment received on sale bill",
      date: paidOn,
      createdAt,
    });
  }
  if (towardsOld > 0 && isCashMode(sale.mode)) {
    const { left } = await payOldDues(tx, userId, customerId, towardsOld, sale.mode, paidOn, saleBill.id);
    if (left > 0) throw new UserError(`The payment is ${inr(left)} more than this bill and what the customer already owes.`);
  }

  return { saleBill, lines, looseLines, advance, towardsOld };
}

// Rows written in the same moment as the bill (in one transaction, so at one database time).
// Compared to the millisecond, as rows written again by a correction keep the time read back.
const sameMoment = (column: PgColumn, saleId: string) =>
  sql`date_trunc('milliseconds', ${column}) = (select date_trunc('milliseconds', b.created_at) from item_sale_bill b where b.id = ${saleId}::uuid)`;

// Takes a bill's own effects back out, as if it had not been entered: its pieces and loose metal
// go back, what was set against it (advance, BC, money held, old metal) is released, and the
// money paid with it comes out of the cash book. Payments received on it later stay, and are
// returned so the bill written again can keep them. Locks the bill. Owner's correction only.
export async function unwriteSale(tx: Tx, saleId: string) {
  const [bill] = await tx.select().from(itemSaleBill).where(eq(itemSaleBill.id, saleId)).for("update");
  if (!bill) throw new UserError("Sale bill not found.");
  if (bill.cancelledAt) throw new UserError("A cancelled bill cannot be edited.");
  const createdAt = bill.createdAt;

  const details = await tx.select().from(itemSaleDetails).where(eq(itemSaleDetails.sale, saleId));
  const withBill = await tx.select({ id: itemSaleDetails.id }).from(itemSaleDetails)
    .where(and(eq(itemSaleDetails.sale, saleId), or(
      notInArray(itemSaleDetails.mode, ["cash", "online"]),
      sameMoment(itemSaleDetails.createdAt, saleId),
    )));
  const ownIds = new Set(withBill.map((row) => row.id));
  const own = details.filter((row) => ownIds.has(row.id));
  const later = details.filter((row) => !ownIds.has(row.id));
  const laterPaid = round2(later.reduce((sum, row) => sum + (row.amtPaid ?? 0), 0));
  const firstLater = later.map((row) => row.date).filter((d): d is string => !!d).sort((a, b) => parseDbDate(a).getTime() - parseDbDate(b).getTime())[0] ?? null;

  // Money paid with the bill, out of the cash book.
  if (own.length > 0) {
    await tx.delete(cashLedger).where(and(eq(cashLedger.sourceTable, "item_sale_details"), inArray(cashLedger.sourceId, own.map((row) => row.id))));
    await tx.delete(itemSaleDetails).where(inArray(itemSaleDetails.id, own.map((row) => row.id)));
  }
  // Money held for the customer and spent on the bill is held again.
  const lendUsed = await tx.delete(lendEntry).where(and(eq(lendEntry.sale, saleId), eq(lendEntry.mode, "sale"))).returning();

  // Old metal taken in exchange, if still untouched in the vault.
  const exchanged = await tx.select().from(oldItem).where(eq(oldItem.saleBill, saleId));
  if (exchanged.some((old) => old.status !== "vault")) {
    throw new UserError("Old metal taken on this bill has already been melted or refurbished, so the bill cannot be edited.");
  }
  if (exchanged.length > 0) {
    const paid = await tx.select({ id: oldItemPayment.id }).from(oldItemPayment).where(inArray(oldItemPayment.oldItem, exchanged.map((old) => old.id)));
    if (paid.length > 0) throw new UserError("Old metal taken on this bill has payments of its own, so the bill cannot be edited.");
    await tx.delete(oldItem).where(eq(oldItem.saleBill, saleId));
  }

  // Loose metal back into its lot, with any weighing difference written off when it was sold.
  const lines = await tx.select().from(itemSale).where(eq(itemSale.bill, saleId));
  const lineIds = lines.map((line) => line.id);
  if (lineIds.length > 0) {
    await tx.delete(looseStockLedger).where(and(eq(looseStockLedger.sourceTable, "item_sale"), inArray(looseStockLedger.sourceId, lineIds)));
    await tx.delete(looseStockLedger).where(and(eq(looseStockLedger.sourceTable, "weighing_difference"), inArray(looseStockLedger.sourceId, lineIds)));
  }
  // Bills entered before the write-off carried its line: found by its lot and the bill's moment.
  for (const line of lines.filter((row) => !row.item && row.itemType)) {
    await tx.delete(looseStockLedger).where(and(
      eq(looseStockLedger.sourceTable, "weighing_difference"),
      isNull(looseStockLedger.sourceId),
      eq(looseStockLedger.itemType, line.itemType!),
      eq(looseStockLedger.melting, line.melting ?? 0),
      eq(looseStockLedger.wastage, line.lotWastage ?? 0),
      eq(looseStockLedger.making, line.lotMaking ?? 0),
      eq(looseStockLedger.date, bill.date!),
    ));
  }
  if (lineIds.length > 0) await tx.delete(itemSale).where(eq(itemSale.bill, saleId));

  // Pieces back where they were: out on approval if the bill closed an approval, else in the shop.
  const stockIds = lines.map((line) => line.item).filter((item): item is string => !!item);
  if (stockIds.length > 0) {
    const approved = bill.date ? await tx.update(itemApproval)
      .set({ dateBack: null, outcome: null, updatedAt: new Date() })
      .where(and(inArray(itemApproval.item, stockIds), eq(itemApproval.outcome, "sold"), eq(itemApproval.dateBack, bill.date)))
      .returning({ item: itemApproval.item }) : [];
    const back = await tx.update(itemStock)
      .set({ status: "stock", updatedAt: new Date() })
      .where(and(inArray(itemStock.id, stockIds), eq(itemStock.status, "sold")))
      .returning({ id: itemStock.id });
    const onApproval = approved.map((row) => row.item);
    if (onApproval.length > 0) await tx.update(itemStock).set({ status: "on_approval" }).where(inArray(itemStock.id, onApproval));
    if (back.length !== stockIds.length) throw new UserError("A piece on this bill is no longer marked as sold. Reload and check it.");
  }

  // A delivered order is open again; the bill written again delivers it once more if it is on it.
  if (bill.order) {
    await tx.update(itemOrder).set({ status: "at shop", updatedAt: new Date() })
      .where(and(eq(itemOrder.id, bill.order), eq(itemOrder.status, "dispatched")));
  }

  // A payment made with the bill that also paid earlier dues wrote those payments at the same
  // moment. They stay; the caller moves their date with the bill's.
  const [otherBills, loans, repairs] = await Promise.all([
    tx.select({ id: itemSaleDetails.id }).from(itemSaleDetails).where(and(ne(itemSaleDetails.sale, saleId), sameMoment(itemSaleDetails.createdAt, saleId))),
    tx.select({ id: loanEntry.id }).from(loanEntry).where(and(eq(loanEntry.type, "repayment"), sameMoment(loanEntry.createdAt, saleId))),
    tx.select({ id: itemRepairingPayment.id }).from(itemRepairingPayment).where(sameMoment(itemRepairingPayment.createdAt, saleId)),
  ]);

  return {
    bill,
    rewrite: { id: saleId, createdAt, laterPaid, firstLater } satisfies Rewrite,
    before: { bill, lines, payments: own, lendUsed, oldMetal: exchanged },
    alsoPaid: { sale: otherBills.map((row) => row.id), loan: loans.map((row) => row.id), repair: repairs.map((row) => row.id) },
  };
}

// Moves the payments towards earlier dues made along with a bill to the bill's new payment day.
export async function moveAlsoPaid(tx: Tx, alsoPaid: Awaited<ReturnType<typeof unwriteSale>>["alsoPaid"], date: string) {
  const at = { date, updatedAt: new Date() };
  const moves = [
    { ids: alsoPaid.sale, table: itemSaleDetails, source: "item_sale_details" },
    { ids: alsoPaid.loan, table: loanEntry, source: "loan_entry" },
    { ids: alsoPaid.repair, table: itemRepairingPayment, source: "item_repairing_payment" },
  ] as const;
  for (const move of moves) {
    if (move.ids.length === 0) continue;
    await tx.update(move.table).set(at).where(inArray(move.table.id, move.ids));
    await tx.update(cashLedger).set(at).where(and(eq(cashLedger.sourceTable, move.source), inArray(cashLedger.sourceId, move.ids)));
  }
}
