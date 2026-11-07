import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { entity, miscItem, users } from "@/db/schema/entities";
import { bc, entityBalance, lend, lendEntry, loan, loanEntry } from "@/db/schema/finance";
import { miscTrade } from "@/db/schema/ledger";
import { bill, fineTrade, goldLoan, itemApproval, itemOrder, itemRepairing, itemSaleBill, itemStock, itemType, oldItem, supplierReturn } from "@/db/schema/sales";
import { Card, DataTable, Empty, PageHeader, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, grams, inr } from "@/lib/format";
import { partyTotals } from "@/lib/parties";
import { round2 } from "@/lib/pricing";

const TAB_OF: Record<string, { tab: string; label: string }> = {
  customer: { tab: "customer", label: "Customers" },
  supplier: { tab: "supplier", label: "Suppliers" },
  staff: { tab: "staff", label: "Staff" },
};

const due = (amt: number | null, paid: number | null) => round2((amt ?? 0) - (paid ?? 0));
const dueCell = (amount: number) => <span key="d" className={amount > 0 ? "text-warn" : ""}>{inr(amount)}</span>;

// Sums a cash account the way /loans/[kind]/[id] does: repayments take away, everything else adds.
const accountBalance = (entries: { type: string | null; amt: number | null }[]) =>
  round2(entries.reduce((sum, entry) => sum + (entry.type === "repayment" ? -(entry.amt ?? 0) : entry.amt ?? 0), 0));

// Everything the shop has on record for one customer, supplier or staff member, each line linking
// to the page where it is handled. Sections with nothing in them are left out.
export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [person] = await db.select().from(entity).where(eq(entity.id, id));
  if (!person) notFound();

  const [
    [balance],
    logins,
    sales,
    orders,
    repairs,
    goldLoans,
    oldMetal,
    bcs,
    loanAccounts,
    lendAccounts,
    bills,
    returns,
    approvals,
    miscTrades,
    fineTrades,
  ] = await Promise.all([
    db.select().from(entityBalance).where(eq(entityBalance.entity, id)),
    db.select({ username: users.username, role: users.role, isActive: users.isActive }).from(users).where(eq(users.entity, id)),
    db.select().from(itemSaleBill).where(eq(itemSaleBill.customer, id)).orderBy(desc(itemSaleBill.date)),
    db.select().from(itemOrder).where(eq(itemOrder.customer, id)).orderBy(desc(itemOrder.date)),
    db.select().from(itemRepairing).where(or(eq(itemRepairing.customer, id), eq(itemRepairing.karigar, id))).orderBy(desc(itemRepairing.receivedDate)),
    db.select().from(goldLoan).where(eq(goldLoan.customer, id)).orderBy(desc(goldLoan.date)),
    db.select().from(oldItem).where(eq(oldItem.customer, id)).orderBy(desc(oldItem.date)),
    db.select().from(bc).where(eq(bc.customer, id)).orderBy(desc(bc.startDate)),
    db.select({ id: loan.id, type: loanEntry.type, amt: loanEntry.amt }).from(loan).leftJoin(loanEntry, eq(loanEntry.loan, loan.id)).where(eq(loan.borrower, id)),
    db.select({ id: lend.id, type: lendEntry.type, amt: lendEntry.amt }).from(lend).leftJoin(lendEntry, eq(lendEntry.lend, lend.id)).where(eq(lend.lender, id)),
    db.select().from(bill).where(eq(bill.supplier, id)).orderBy(desc(bill.date)),
    db.select().from(supplierReturn).where(eq(supplierReturn.supplier, id)).orderBy(desc(supplierReturn.date)),
    db.select({ approval: itemApproval, label: itemStock.label, typeName: itemType.name })
      .from(itemApproval)
      .innerJoin(itemStock, eq(itemStock.id, itemApproval.item))
      .leftJoin(itemType, eq(itemType.id, itemStock.itemType))
      .where(eq(itemApproval.entity, id))
      .orderBy(desc(itemApproval.dateOut)),
    db.select({ trade: miscTrade, itemName: miscItem.name }).from(miscTrade).leftJoin(miscItem, eq(miscItem.id, miscTrade.item)).where(eq(miscTrade.entity, id)).orderBy(desc(miscTrade.date)),
    db.select().from(fineTrade).where(eq(fineTrade.entity, id)).orderBy(desc(fineTrade.date)),
  ]);

  const totals = balance ? partyTotals(balance) : { owesShop: 0, shopOwes: 0 };
  const loanAccount = loanAccounts[0] && { id: loanAccounts[0].id, balance: accountBalance(loanAccounts) };
  const lendAccount = lendAccounts[0] && { id: lendAccounts[0].id, balance: accountBalance(lendAccounts) };
  const back = TAB_OF[person.type ?? ""] ?? TAB_OF.customer;

  const sections: { key: string; title: string; hint?: string; table: React.ReactNode }[] = [];

  if (sales.length) sections.push({
    key: "sales",
    title: "Sale bills",
    table: <DataTable
      head={["Date", "Total", "Paid", "Due", "Status"]}
      right={[1, 2, 3]}
      empty=""
      rows={sales.map((sale) => [
        <Link key="d" href={`/sales/${sale.id}`}>{dateOnly(sale.date)}</Link>,
        inr(sale.totalAmt),
        inr(sale.paidAmt),
        sale.cancelledAt ? "-" : dueCell(due(sale.totalAmt, sale.paidAmt)),
        sale.cancelledAt
          ? <StatusBadge key="s" tone="red">cancelled</StatusBadge>
          : <StatusBadge key="s" tone={due(sale.totalAmt, sale.paidAmt) > 0 ? "amber" : "emerald"}>{due(sale.totalAmt, sale.paidAmt) > 0 ? "due" : "paid"}</StatusBadge>,
      ])}
    />,
  });

  if (orders.length) sections.push({
    key: "orders",
    title: "Orders",
    table: <DataTable
      head={["Date", "Item", "Weight", "Amount", "Advance paid", "Status"]}
      right={[2, 3, 4]}
      empty=""
      rows={orders.map((order) => [
        <Link key="d" href={`/orders/${order.id}`}>{dateOnly(order.date)}</Link>,
        order.name || "-",
        grams(order.weight),
        inr(order.amt),
        inr(order.amtPaid),
        <StatusBadge key="s" tone={order.status === "dispatched" ? "emerald" : order.status === "at shop" ? "blue" : "amber"}>{order.status}</StatusBadge>,
      ])}
    />,
  });

  if (repairs.length) sections.push({
    key: "repairs",
    title: "Repairs",
    hint: repairs.some((repair) => repair.karigar === id) ? "Includes repairs sent to them as karigar." : undefined,
    table: <DataTable
      head={["Received", "Item", "As", "Charge", "Due", "Status"]}
      right={[3, 4]}
      empty=""
      rows={repairs.map((repair) => [
        <Link key="d" href={`/repairs/${repair.id}`}>{dateOnly(repair.receivedDate)}</Link>,
        repair.desc || "-",
        repair.customer === id ? "Customer" : "Karigar",
        inr(repair.amt),
        repair.customer === id ? dueCell(due(repair.amt, repair.paidAmt)) : "-",
        <StatusBadge key="s" tone={repair.status === "returned" ? "emerald" : repair.status === "repaired" ? "blue" : "amber"}>{repair.status}</StatusBadge>,
      ])}
    />,
  });

  if (goldLoans.length) sections.push({
    key: "gold-loans",
    title: "Gold loans (girvi)",
    hint: "Principal only; interest is on each loan's page.",
    table: <DataTable
      head={["Date", "Item", "Weight", "Principal", "Principal left", "Status"]}
      right={[2, 3, 4]}
      empty=""
      rows={goldLoans.map((pledge) => [
        <Link key="d" href={`/gold-loans/${pledge.id}`}>{dateOnly(pledge.date)}</Link>,
        pledge.item || pledge.desc || "-",
        grams(pledge.weight),
        inr(pledge.amt),
        pledge.status === "active" ? dueCell(due(pledge.amt, pledge.amtPaid)) : "-",
        <StatusBadge key="s" tone={pledge.status === "active" ? "amber" : pledge.status === "closed" ? "emerald" : "red"}>{pledge.status}</StatusBadge>,
      ])}
    />,
  });

  if (oldMetal.length) sections.push({
    key: "old-metal",
    title: "Old metal bought",
    table: <DataTable
      head={["Date", "Metal", "Weight", "Amount", "Paid", "Status"]}
      right={[2, 3, 4]}
      empty=""
      rows={oldMetal.map((item) => [
        <Link key="d" href={`/old-gold/${item.id}`}>{dateOnly(item.date)}</Link>,
        item.metal || "-",
        grams(item.weight),
        inr(item.amt),
        item.saleBill || item.order || item.goldLoan ? "Set against a bill" : inr(item.paidAmt),
        <StatusBadge key="s" tone="zinc">{item.status ?? "-"}</StatusBadge>,
      ])}
    />,
  });

  if (bcs.length) sections.push({
    key: "bc",
    title: "BC",
    table: <DataTable
      head={["Card no.", "Started", "Instalment", "Months", "Status"]}
      right={[2, 3]}
      empty=""
      rows={bcs.map((scheme) => [
        <Link key="c" href={`/bc/${scheme.id}`}>{scheme.cardNo || "No card no."}</Link>,
        dateOnly(scheme.startDate),
        inr(scheme.instalment),
        scheme.months,
        <StatusBadge key="s" tone={scheme.maturedAt ? "emerald" : "amber"}>{scheme.maturedAt ? `matured · ${inr(scheme.value)}` : "running"}</StatusBadge>,
      ])}
    />,
  });

  if (loanAccount || lendAccount) sections.push({
    key: "cash",
    title: "Cash accounts",
    hint: "Money lent to them, and money borrowed from or held for them (सावकारी).",
    table: <DataTable
      head={["Account", "Balance"]}
      right={[1]}
      empty=""
      rows={[
        ...(loanAccount ? [[<Link key="a" href={`/loans/given/${loanAccount.id}`}>Shop lent them</Link>, <span key="b" className={loanAccount.balance > 0 ? "text-ok" : ""}>{inr(loanAccount.balance)} owed to the shop</span>]] : []),
        ...(lendAccount ? [[<Link key="a" href={`/loans/taken/${lendAccount.id}`}>Shop borrowed / holds</Link>, <span key="b" className={lendAccount.balance > 0 ? "text-bad" : ""}>{inr(lendAccount.balance)} owed by the shop</span>]] : []),
      ]}
    />,
  });

  if (bills.length) sections.push({
    key: "bills",
    title: "Purchase bills",
    table: <DataTable
      head={["Date", "Metal", "Fine", "Bill", "Paid", "Due"]}
      right={[2, 3, 4, 5]}
      empty=""
      rows={bills.map((purchase) => [
        <Link key="d" href={`/purchases/${purchase.id}`}>{dateOnly(purchase.date)}</Link>,
        `${purchase.metal ?? ""} ${purchase.standard ?? ""}`.trim() || "-",
        grams(purchase.fine),
        inr(purchase.billAmt),
        inr(purchase.paidAmt),
        <span key="u" className={due(purchase.billAmt, purchase.paidAmt) > 0 ? "text-bad" : ""}>{inr(due(purchase.billAmt, purchase.paidAmt))}</span>,
      ])}
    />,
  });

  if (returns.length) sections.push({
    key: "returns",
    title: "Returned to supplier",
    table: <DataTable
      head={["Date", "Fine", "Amount"]}
      right={[1, 2]}
      empty=""
      rows={returns.map((ret) => [
        <Link key="d" href={`/inventory/${ret.item}`}>{dateOnly(ret.date)}</Link>,
        grams(ret.fine),
        inr(ret.amt),
      ])}
    />,
  });

  if (approvals.length) sections.push({
    key: "approvals",
    title: "Pieces taken on approval",
    table: <DataTable
      head={["Out", "Piece", "Back", "Outcome"]}
      empty=""
      rows={approvals.map(({ approval, label, typeName }) => [
        <Link key="d" href={`/inventory/${approval.item}`}>{dateOnly(approval.dateOut)}</Link>,
        `${typeName ?? "Piece"} ${label ?? ""}`.trim(),
        approval.dateBack ? dateOnly(approval.dateBack) : "-",
        approval.outcome
          ? <StatusBadge key="o" tone={approval.outcome === "sold" ? "emerald" : "zinc"}>{approval.outcome}</StatusBadge>
          : <StatusBadge key="o" tone="amber">still out</StatusBadge>,
      ])}
    />,
  });

  if (miscTrades.length) sections.push({
    key: "misc",
    title: "Other items bought and sold",
    table: <DataTable
      head={["Date", "Type", "Item", "Qty", "Amount", "Due"]}
      right={[3, 4, 5]}
      empty=""
      rows={miscTrades.map(({ trade, itemName }) => [
        dateOnly(trade.date),
        <span key="t" className="capitalize">{trade.type}</span>,
        itemName || "-",
        trade.qty ?? "-",
        inr(trade.amt),
        trade.type === "purchase" ? inr(due(trade.amt, trade.paidAmt)) : "-",
      ])}
    />,
  });

  if (fineTrades.length) sections.push({
    key: "fine",
    title: "Fine metal trades",
    table: <DataTable
      head={["Date", "Type", "Metal", "Weight", "Rate", "Amount"]}
      right={[3, 4, 5]}
      empty=""
      rows={fineTrades.map((trade) => [
        dateOnly(trade.date),
        <span key="t" className="capitalize">{trade.type}</span>,
        `${trade.metal ?? ""} ${trade.standard ?? ""}`.trim() || "-",
        grams(trade.weight),
        inr(trade.rate),
        inr(trade.amt),
      ])}
    />,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: `/parties?tab=${back.tab}`, label: back.label }}
        title={<>{person.name ?? "Unknown"} <StatusBadge tone="zinc">{person.type}</StatusBadge></>}
        subtitle={person.contact ? `Phone: ${person.contact}` : "No phone number on record"}
      />

      <Stats items={[
        { name: "Owes the shop", value: inr(totals.owesShop), tone: totals.owesShop > 0 ? "ok" : undefined, note: "Gold loan interest not included" },
        { name: "Shop owes", value: inr(totals.shopOwes), tone: totals.shopOwes > 0 ? "bad" : undefined },
        { name: "On record since", value: dateOnly(person.createdAt) },
      ]} />

      {logins.length > 0 && (
        <Card title="App login">
          <p className="text-sm text-fg-2">
            {logins.map((login) => `${login.username} (${login.role}${login.isActive ? "" : ", disabled"})`).join(", ")}
          </p>
        </Card>
      )}

      {sections.length === 0 ? (
        <Card><Empty>Nothing recorded with {person.name ?? "this person"} yet.</Empty></Card>
      ) : (
        sections.map((section) => (
          <section key={section.key} className="space-y-2">
            <div>
              <h2 className="text-[15px] font-semibold text-fg">{section.title}</h2>
              {section.hint && <p className="text-[13px] text-fg-3">{section.hint}</p>}
            </div>
            {section.table}
          </section>
        ))
      )}
    </div>
  );
}
