import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { entity, miscCategory, miscItem } from "@/db/schema/entities";
import { miscTrade } from "@/db/schema/ledger";
import { addMiscCategory, addMiscItem, addMiscTrade, payMiscTradeChosen } from "@/app/actions/misc";
import { ActionForm } from "@/components/ActionForm";
import { CreditFields } from "@/components/CreditFields";
import { Card, DataTable, DateField, EntityFields, Field, ModeField, PageHeader, Rupees, SelectField, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { dueStatus } from "@/lib/due";
import { listEntities } from "@/lib/entities";
import { dateOnly, dateTime, inr } from "@/lib/format";
import { round2 } from "@/lib/pricing";

export default async function MiscPage() {
  await getCurrentUser();

  const categories = await db.select().from(miscCategory).orderBy(asc(miscCategory.name));
  const people = await listEntities(["customer", "supplier"]);

  // Quantity in hand is what was bought minus what was sold.
  const items = await db
    .select({
      id: miscItem.id,
      name: miscItem.name,
      unit: miscItem.unit,
      categoryName: miscCategory.name,
      inHand: sql<number>`coalesce(sum(case when ${miscTrade.type} = 'purchase' then ${miscTrade.qty} when ${miscTrade.type} = 'sale' then -${miscTrade.qty} end), 0)`.mapWith(Number),
    })
    .from(miscItem)
    .leftJoin(miscCategory, eq(miscItem.category, miscCategory.id))
    .leftJoin(miscTrade, eq(miscTrade.item, miscItem.id))
    .groupBy(miscItem.id, miscCategory.name)
    .orderBy(asc(miscItem.name));

  const trades = await db
    .select({ trade: miscTrade, itemName: miscItem.name, unit: miscItem.unit, partyName: entity.name })
    .from(miscTrade)
    .innerJoin(miscItem, eq(miscTrade.item, miscItem.id))
    .innerJoin(entity, eq(miscTrade.entity, entity.id))
    .orderBy(desc(miscTrade.date))
    .limit(50);

  // Purchases bought on a supplier's credit and not yet paid for, the soonest due first.
  const balance = (trade: { amt: number | null; paidAmt: number | null }) => round2((trade.amt ?? 0) - (trade.paidAmt ?? 0));
  const unpaid = await db
    .select({ trade: miscTrade, itemName: miscItem.name, partyName: entity.name })
    .from(miscTrade)
    .innerJoin(miscItem, eq(miscTrade.item, miscItem.id))
    .innerJoin(entity, eq(miscTrade.entity, entity.id))
    .where(and(eq(miscTrade.type, "purchase"), sql`coalesce(${miscTrade.amt}, 0) > coalesce(${miscTrade.paidAmt}, 0)`))
    .orderBy(sql`${miscTrade.dueDate} asc nulls last`, asc(miscTrade.date));

  return (
    <div className="space-y-6">
      <PageHeader title="Misc Items" subtitle="Boxes, gemstones, silver articles and other things traded by count." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Buy or sell" className="lg:col-span-2">
          <ActionForm action={addMiscTrade} submitLabel="Record trade">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SelectField label="Type" name="type" options={[{ value: "sale", label: "Sale" }, { value: "purchase", label: "Purchase" }]} />
              <SelectField label="Item" name="item" options={items.map((item) => ({ value: item.id, label: `${item.name} (${item.unit})` }))} />
              <Field label="Quantity" name="qty" type="number" step="1" min="1" required />
              <Rupees label="Unit price (₹)" name="unitPrice" required />
            </div>
            <EntityFields label="Customer or supplier" entities={people} newLabel="Or a new one" />
            <div className="max-w-xs"><ModeField label="Cash or online" /></div>
            <DateField />
            <div className="space-y-4 border-t border-line pt-4">
              <p className="text-[13px] text-fg-3">Only for a purchase bought on the supplier&apos;s credit.</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Paid now (₹)" name="paid" type="number" step="0.01" min="0" hint="Empty means paid in full." />
                <CreditFields className="grid grid-cols-2 gap-4 md:col-span-2" />
              </div>
            </div>
          </ActionForm>
        </Card>

        <div className="space-y-6">
          <Card title="New category">
            <ActionForm action={addMiscCategory} submitLabel="Add category">
              <Field label="Name" name="name" type="text" placeholder="e.g. Gemstones" required />
            </ActionForm>
          </Card>
          <Card title="New item">
            <ActionForm action={addMiscItem} submitLabel="Add item">
              <SelectField label="Category" name="category" options={categories.map((category) => ({ value: category.id, label: category.name ?? "Unnamed" }))} />
              <Field label="Name" name="name" type="text" required />
              <SelectField label="Unit" name="unit" options={["piece", "pair", "set", "gram"]} />
            </ActionForm>
          </Card>
        </div>
      </div>

      {unpaid.length > 0 && (
        <Card title="Pay a supplier" hint="Purchases bought on credit and still owed for.">
          <ActionForm action={payMiscTradeChosen} submitLabel="Record payment">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <SelectField
                label="Purchase"
                name="trade"
                className="md:col-span-2"
                options={unpaid.map(({ trade, itemName, partyName }) => {
                  const credit = dueStatus(trade.dueDate, balance(trade));
                  return {
                    value: trade.id,
                    label: [partyName, `${trade.qty} ${itemName}`, dateOnly(trade.date), `${inr(balance(trade))} due`, credit?.label].filter(Boolean).join(" · "),
                  };
                })}
              />
              <Rupees label="Amount (₹)" name="amt" required />
              <ModeField label="Paid from" />
            </div>
            <DateField />
          </ActionForm>
        </Card>
      )}

      <DataTable
        head={["Item", "Category", "Unit", "In hand"]}
        right={[3]}
        empty="No items yet. Add a category, then an item."
        rows={items.map((item) => [
          <span key="n" className="font-medium text-fg">{item.name}</span>,
          item.categoryName,
          item.unit,
          item.inHand,
        ])}
      />

      <DataTable
        head={["Time", "Type", "Item", "With", "Qty", "Unit price", "Amount", "Still due"]}
        right={[4, 5, 6]}
        empty="No trades yet."
        rows={trades.map(({ trade, itemName, unit, partyName }) => {
          const due = trade.type === "purchase" ? balance(trade) : 0;
          const credit = dueStatus(trade.dueDate, due);
          return [
            <span key="t" className="whitespace-nowrap">{dateTime(trade.date)}</span>,
            <span key="y" className="capitalize">{trade.type}</span>,
            itemName,
            partyName,
            `${trade.qty} ${unit ?? ""}`,
            inr(trade.unitPrice),
            inr(trade.amt),
            due > 0 ? (
              <span key="d" className="whitespace-nowrap tabular-nums">
                {inr(due)}
                {credit
                  ? <span className="ml-2"><StatusBadge tone={credit.tone}>{credit.label}</StatusBadge></span>
                  : <span className="ml-2 text-[13px] text-fg-3">no due date</span>}
              </span>
            ) : "-",
          ];
        })}
      />
    </div>
  );
}
