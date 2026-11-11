import "server-only";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { itemOrder, itemPurchased, itemRepairing, itemSale, itemSaleBill, itemSaleDetails, itemStock, itemType, oldItem } from "@/db/schema/sales";
import { istDate, istTime, parseDbDate } from "@/lib/format";
import { listBcs } from "@/lib/bc";
import { CUSTOMER_TYPES } from "@/lib/entities";
import { balanceOf } from "@/lib/dues";
import { getCurrentRates } from "@/lib/ledger";
import { looseBalances, lotKey, type LooseLot } from "@/lib/loose";
import { round2, round3 } from "@/lib/pricing";

// What the sale and purchase bill forms choose from. Read here once, for the two places each
// form is shown: its own page, and the day book's popup.

export async function saleFormData(day: string) {
  const customers = await db
    .select({ id: entity.id, name: entity.name, type: entity.type })
    .from(entity)
    .where(inArray(entity.type, CUSTOMER_TYPES))
    .orderBy(asc(entity.name));

  const pieces = await db
    .select({
      id: itemStock.id,
      label: itemStock.label,
      typeName: itemType.name,
      metal: itemStock.metal,
      netWeight: itemStock.netWeight,
      grossWeight: itemStock.grossWeight,
      huid: itemStock.huid,
      melting: itemStock.melting,
      status: itemStock.status,
    })
    .from(itemStock)
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .where(inArray(itemStock.status, ["stock", "on_approval"]))
    .orderBy(asc(itemType.name), asc(itemStock.label));

  // Undelivered orders whose piece has arrived and is available to bill.
  const made = await db
    .select({ order: itemOrder, stockId: itemStock.id })
    .from(itemOrder)
    .innerJoin(itemPurchased, eq(itemPurchased.order, itemOrder.id))
    .innerJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .where(ne(itemOrder.status, "dispatched"));
  const orders = [...new Set(made.map((row) => row.order.id))].map((orderId) => {
    const rows = made.filter((row) => row.order.id === orderId);
    const { order } = rows[0];
    return {
      id: order.id,
      customerId: order.customer,
      name: order.name,
      stockIds: rows.map((row) => row.stockId).filter((stockId) => pieces.some((piece) => piece.id === stockId)),
      advance: order.amtPaid ?? 0,
      bookedRate: order.rateBooked ? order.bookedRate : null,
    };
  }).filter((order) => order.stockIds.length > 0);

  // Loose metal (mani) that can be sold by weight: one choice per type and melting on hand.
  // A counted lot with no pieces left (only a leftover weight to be weighed off) cannot be sold from.
  const loose = (await looseBalances()).filter((row) => row.weight > 0 && (!row.counted || row.pieces > 0));

  // Every BC not yet used up: a matured one is spent on the bill, a running one is shown so the
  // counter can tell the customer when it matures.
  const bcs = (await listBcs()).filter((row) => row.status !== "used").map((row) => ({
    id: row.id,
    customerId: row.customer,
    cardNo: row.cardNo,
    balance: row.balance,
    matured: row.status === "ready",
    maturesOn: row.maturesOn,
    monthsPaid: row.monthsPaid,
    months: row.months,
  }));

  // Money the shop holds for each customer (their सावकारी account), which a bill can be paid out
  // of, and what each already owes (earlier bills, loan account, repairs), which a payment beyond
  // the bill goes to.
  const [heldRows, billRows, loanRows, repairRows] = await Promise.all([
    db.select({ customerId: lend.lender, amt: balanceOf(lendEntry.amt, lendEntry.type) })
      .from(lend)
      .innerJoin(lendEntry, eq(lendEntry.lend, lend.id))
      .groupBy(lend.lender),
    db.select({ customerId: itemSaleBill.customer, amt: sql<number>`sum(coalesce(${itemSaleBill.totalAmt}, 0) - coalesce(${itemSaleBill.paidAmt}, 0))`.mapWith(Number) })
      .from(itemSaleBill)
      .where(and(isNull(itemSaleBill.cancelledAt), sql`coalesce(${itemSaleBill.totalAmt}, 0) > coalesce(${itemSaleBill.paidAmt}, 0)`))
      .groupBy(itemSaleBill.customer),
    db.select({ customerId: loan.borrower, amt: balanceOf(loanEntry.amt, loanEntry.type) })
      .from(loan)
      .innerJoin(loanEntry, eq(loanEntry.loan, loan.id))
      .groupBy(loan.borrower),
    db.select({ customerId: itemRepairing.customer, amt: sql<number>`sum(coalesce(${itemRepairing.amt}, 0) - coalesce(${itemRepairing.paidAmt}, 0))`.mapWith(Number) })
      .from(itemRepairing)
      .where(sql`coalesce(${itemRepairing.amt}, 0) > coalesce(${itemRepairing.paidAmt}, 0)`)
      .groupBy(itemRepairing.customer),
  ]);
  const owing = (rows: { customerId: string | null; amt: number }[]) =>
    rows.flatMap((row) => (row.customerId && row.amt > 0 ? [{ customerId: row.customerId, amt: round2(row.amt) }] : []));
  const owed = new Map<string, number>();
  for (const row of owing([...billRows, ...loanRows, ...repairRows])) owed.set(row.customerId, round2((owed.get(row.customerId) ?? 0) + row.amt));

  // A sale written up later is billed at its own day's rates.
  const rates = await getCurrentRates(day);
  return { customers, pieces, loose, orders, bcs, held: owing(heldRows), udhari: [...owed].map(([customerId, amt]) => ({ customerId, amt })), rates };
}

export async function purchaseFormData() {
  const suppliers = await db.select({ id: entity.id, name: entity.name }).from(entity).where(eq(entity.type, "supplier"));
  const itemTypes = await db.select({ id: itemType.id, name: itemType.name, metal: itemType.metal }).from(itemType).orderBy(asc(itemType.loose), asc(itemType.name));

  // Orders still waiting for their piece from the maker
  const orders = await db
    .select({ id: itemOrder.id, name: itemOrder.name, metal: itemOrder.metal, customerName: entity.name })
    .from(itemOrder)
    .leftJoin(entity, eq(itemOrder.customer, entity.id))
    .where(inArray(itemOrder.status, ["order taken", "being made"]));

  return { suppliers, itemTypes, orders };
}

// A sale bill opened for correction: the form's lists as for a new bill on the bill's day, with
// what this bill itself took put back (its pieces, loose weight, order, BC balance and money
// held), and the bill as it was entered, to start the form from. Null for a bill not found.
export async function saleEditData(id: string) {
  const [bill] = await db.select().from(itemSaleBill).where(eq(itemSaleBill.id, id));
  if (!bill) return null;
  const billAt = parseDbDate(bill.date ?? bill.createdAt);
  const day = istDate(billAt);
  const lists = await saleFormData(day);

  const [lines, details, exchanged, lendUsed] = await Promise.all([
    db.select().from(itemSale).where(eq(itemSale.bill, id)).orderBy(asc(itemSale.createdAt)),
    db.select({
      detail: itemSaleDetails,
      // Paid along with the bill (written in the same moment), or received later.
      withBill: sql<boolean>`${itemSaleDetails.mode} not in ('cash', 'online') or date_trunc('milliseconds', ${itemSaleDetails.createdAt}) = date_trunc('milliseconds', ${itemSaleBill.createdAt})`,
    }).from(itemSaleDetails).innerJoin(itemSaleBill, eq(itemSaleDetails.sale, itemSaleBill.id)).where(eq(itemSaleDetails.sale, id)),
    db.select().from(oldItem).where(eq(oldItem.saleBill, id)),
    db.select().from(lendEntry).where(and(eq(lendEntry.sale, id), eq(lendEntry.mode, "sale"))),
  ]);
  const own = details.filter((row) => row.withBill).map((row) => row.detail);
  const later = details.filter((row) => !row.withBill).map((row) => row.detail);
  const money = own.filter((row) => row.mode === "cash" || row.mode === "online");
  const fromLend = round2(lendUsed.reduce((sum, row) => sum + (row.amt ?? 0), 0));

  // The bill's pieces, sold, are not in the stock list: put them in.
  const stockIds = lines.map((line) => line.item).filter((item): item is string => !!item);
  const ownPieces = stockIds.length === 0 ? [] : await db
    .select({
      id: itemStock.id, label: itemStock.label, typeName: itemType.name, metal: itemStock.metal, netWeight: itemStock.netWeight,
      grossWeight: itemStock.grossWeight, huid: itemStock.huid, melting: itemStock.melting, status: itemStock.status,
    })
    .from(itemStock)
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .where(inArray(itemStock.id, stockIds));
  const pieces = [...ownPieces, ...lists.pieces.filter((piece) => !stockIds.includes(piece.id))];

  // Loose lots with this bill's weight and pieces back in them.
  const looseLines = lines.filter((line) => !line.item && line.itemType);
  const lots = await looseBalances();
  const types = looseLines.length === 0 ? [] : await db.select().from(itemType).where(inArray(itemType.id, [...new Set(looseLines.map((line) => line.itemType!))]));
  for (const line of looseLines) {
    const terms = { itemTypeId: line.itemType!, melting: line.melting ?? 0, wastage: line.lotWastage ?? 0, making: line.lotMaking ?? 0 };
    let lot: LooseLot | undefined = lots.find((row) => lotKey(row) === lotKey(terms));
    if (!lot) {
      const type = types.find((row) => row.id === terms.itemTypeId);
      lot = { ...terms, typeName: type?.name ?? "Loose", metal: type?.metal ?? null, piecesPerGram: type?.piecesPerGram ?? null, counted: type?.counted ?? false, weight: 0, pieces: 0, leftover: false };
      lots.push(lot);
    }
    lot.weight = round3(lot.weight + (line.weight ?? 0));
    lot.pieces += line.pieces ?? 0;
  }
  const loose = lots.filter((row) => row.weight > 0 && (!row.counted || row.pieces > 0));

  // The order this bill delivered, open again for it.
  let orders = lists.orders;
  if (bill.order) {
    const [order] = await db.select().from(itemOrder).where(eq(itemOrder.id, bill.order));
    const made = await db.select({ id: itemStock.id }).from(itemStock)
      .innerJoin(itemPurchased, eq(itemStock.item, itemPurchased.id))
      .where(eq(itemPurchased.order, bill.order));
    if (order) {
      orders = [{
        id: order.id, customerId: order.customer, name: order.name,
        stockIds: made.map((row) => row.id).filter((stockId) => pieces.some((piece) => piece.id === stockId)),
        advance: order.amtPaid ?? 0, bookedRate: order.rateBooked ? order.bookedRate : null,
      }, ...orders.filter((row) => row.id !== order.id)];
    }
  }

  // What this bill spent from a BC is on it again; a BC it used up is shown again.
  const spentHere = own.filter((row) => row.mode === "bc" && row.bc);
  const allBcs = spentHere.length === 0 ? [] : await listBcs();
  const bcs = [...lists.bcs];
  for (const use of spentHere) {
    const listed = bcs.find((row) => row.id === use.bc);
    if (listed) listed.balance = round2(listed.balance + (use.amtPaid ?? 0));
    else {
      const row = allBcs.find((b) => b.id === use.bc);
      if (row) bcs.push({ id: row.id, customerId: row.customer, cardNo: row.cardNo, balance: round2(row.balance + (use.amtPaid ?? 0)), matured: true, maturesOn: row.maturesOn, monthsPaid: row.monthsPaid, months: row.months });
    }
  }
  const held = lists.held.map((row) => ({ ...row }));
  if (fromLend > 0 && bill.customer) {
    const row = held.find((h) => h.customerId === bill.customer);
    if (row) row.amt = round2(row.amt + fromLend);
    else held.push({ customerId: bill.customer, amt: fromLend });
  }

  const paidOn = money[0]?.date ? istDate(parseDbDate(money[0].date)) : day;
  const initial = {
    customerId: bill.customer ?? "",
    orderId: bill.order ?? "",
    lines: lines.filter((line) => line.item).map((line) => ({ stockId: line.item!, rate: line.rate ?? 0, makingPct: line.makingPct ?? 0 })),
    looseLines: looseLines.map((line) => ({
      itemTypeId: line.itemType!, melting: line.melting ?? 0, wastage: line.lotWastage ?? 0, making: line.lotMaking ?? 0,
      weight: line.weight ?? 0, pieces: line.pieces ?? null, rate: line.rate ?? 0, makingPct: line.makingPct ?? 0,
    })),
    oldGold: exchanged.map((old) => ({ metal: old.metal ?? "Gold", weight: old.weight ?? 0, melting: old.melting ?? 0, amt: old.amt ?? 0 })),
    bcUse: Object.fromEntries(spentHere.map((use) => [use.bc!, use.amtPaid ?? 0])),
    fromLend,
    discount: bill.discount ?? 0,
    paidAmt: round2(money.reduce((sum, row) => sum + (row.amtPaid ?? 0), 0)),
    mode: money[0]?.mode ?? "cash",
    day,
    time: istTime(billAt).slice(0, 5),
    paymentDate: paidOn !== day ? paidOn : "",
    laterPaid: round2(later.reduce((sum, row) => sum + (row.amtPaid ?? 0), 0)),
  };
  return { bill, ...lists, pieces, loose, orders, bcs, held, initial };
}
