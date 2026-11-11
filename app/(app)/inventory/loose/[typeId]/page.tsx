import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { itemType, looseStockLedger } from "@/db/schema/sales";
import { checkLooseStock, moveLooseToMetal, setLooseCounted, writeOffLooseLeftover } from "@/app/actions/stock";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, Field, Grams, Notice, PageHeader, SelectField, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateTime, grams } from "@/lib/format";
import { looseBalances, loosePieces, lotTerms, WRITE_OFF_LIMIT } from "@/lib/loose";
import { round3 } from "@/lib/pricing";
import { fineStandardOf } from "@/lib/standards";
import { CountedSwitch } from "./CountedSwitch";

const causes: Record<string, string> = {
  item_purchased: "Purchase",
  item_sale: "Sale",
  sale_cancel: "Sale cancelled",
  stock_check: "Stock check",
  weighing_difference: "Weighing difference",
  opening: "Opening stock",
  metal_transfer: "Moved to fine metal",
};

// A lot is sent from a form as "melting|wastage|making"; the type is in the page's address.
const lotValue = (lot: { melting: number; wastage: number; making: number }) => `${lot.melting}|${lot.wastage}|${lot.making}`;

// One loose type (a kind of mani, phuli or nath): what is on hand in each lot, and every movement.
export default async function LooseStockPage({ params }: { params: Promise<{ typeId: string }> }) {
  await getCurrentUser();
  const { typeId } = await params;
  if (!isUuid(typeId)) notFound();

  const [type] = await db.select().from(itemType).where(eq(itemType.id, typeId));
  if (!type?.loose) notFound();

  const onHand = await looseBalances(db, [typeId]);
  const weight = round3(onHand.reduce((sum, row) => sum + row.weight, 0));
  const pieces = onHand.reduce((sum, row) => sum + row.pieces, 0);
  const about = loosePieces(weight, type.piecesPerGram);
  const leftovers = onHand.filter((row) => row.leftover);
  // Coins, biscuits and slabs at 99.5 or 99.9 can be moved into the fine metal ledger to pay a supplier.
  const fineLots = type.metal === "Gold" || type.metal === "Silver"
    ? onHand.filter((row) => row.weight > 0 && fineStandardOf(row.melting))
    : [];

  const movements = await db
    .select()
    .from(looseStockLedger)
    .where(eq(looseStockLedger.itemType, typeId))
    .orderBy(desc(looseStockLedger.date), desc(looseStockLedger.createdAt))
    .limit(200);
  // Every lot this type has ever had, so one that has run out can still be weighed.
  const lots = new Map<string, { melting: number; wastage: number; making: number }>();
  for (const row of [...onHand, ...movements.map((m) => ({ melting: m.melting ?? 0, wastage: m.wastage, making: m.making }))]) {
    lots.set(lotValue(row), { melting: row.melting, wastage: row.wastage, making: row.making });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/inventory", label: "Inventory" }}
        title={type.name}
        subtitle={`Loose ${type.metal?.toLowerCase() ?? "metal"}, kept in lots${type.counted ? " by piece count and weight" : " by weight"}${type.piecesPerGram ? ` · ${type.piecesPerGram} pieces to the gram` : ""}`}
      />

      <Stats items={[
        { name: "In stock", value: grams(weight) },
        type.counted
          ? { name: "Pieces", value: pieces, note: "Counted" }
          : { name: "About", value: about === null ? "-" : `${about} pieces`, note: about === null ? "Pieces to the gram not set" : "By weight, not counted" },
        { name: "Lots in stock", value: onHand.length },
      ]} />

      {leftovers.length > 0 && (
        <Notice tone="warn" title="Weigh these lots">
          All pieces are sold but the book still shows weight, more than the {WRITE_OFF_LIMIT} g written off by itself.
          Weigh the box: if it is empty, write the leftover off below; if pieces are still there, do a stock check.
        </Notice>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <DataTable
          head={type.counted ? ["Lot", "Pieces", "In stock"] : ["Lot", "About", "In stock"]}
          right={[1, 2]}
          empty="None of this type is in stock."
          rows={onHand.map((row) => [
            <span key="l" className="flex flex-wrap items-center gap-2">
              {lotTerms(row)}
              {row.leftover && <StatusBadge tone="red">leftover: weigh it</StatusBadge>}
            </span>,
            type.counted ? `${row.pieces} pcs` : loosePieces(row.weight, type.piecesPerGram) === null ? "-" : `${loosePieces(row.weight, type.piecesPerGram)} pieces`,
            grams(row.weight),
          ])}
        />

        <div className="space-y-6">
          {leftovers.length > 0 && (
            <Card title="Write off a leftover" hint="For a lot whose pieces are all sold, when the box is empty but the book shows weight. The leftover is written as its own entry with your reason, and the lot is closed.">
              <ActionForm action={writeOffLooseLeftover.bind(null, typeId)} submitLabel="Write off">
                <SelectField label="Lot" name="lot" options={leftovers.map((row) => ({ value: lotValue(row), label: `${lotTerms(row)} · ${grams(row.weight)} left` }))} />
                <Field label="Reason" name="reason" type="text" placeholder="e.g. Box empty, scale difference" required />
                <DateField />
              </ActionForm>
            </Card>
          )}

          {fineLots.length > 0 && (
            <Card title="Move to fine metal" hint={`To hand a coin, biscuit or slab to a supplier: it leaves this stock and is added to fine ${type.metal} (99.9 → 999, 99.5 → 995). Then record it on the purchase bill with "Pay in fine". No sale or cash is recorded.`}>
              <ActionForm action={moveLooseToMetal.bind(null, typeId)} submitLabel="Move to fine metal">
                <SelectField label="Lot" name="lot" options={fineLots.map((row) => ({ value: lotValue(row), label: `${lotTerms(row)} → ${fineStandardOf(row.melting)} · ${type.counted ? `${row.pieces} pcs, ` : ""}${grams(row.weight)} in stock` }))} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Grams label="Weight moved (g)" name="weight" required />
                  {type.counted && <Field label="Pieces moved" name="pieces" type="number" step="1" min="1" required />}
                </div>
                <DateField />
              </ActionForm>
            </Card>
          )}

          <Card title="Stock check" hint={`Weigh${type.counted ? " and count" : ""} what is in the box for one lot. The book is brought to it, and each difference is written below as its own entry.`}>
            {lots.size === 0 ? (
              <p className="text-sm text-fg-3">Nothing has been added to this type yet. It comes in from a supplier&apos;s purchase bill.</p>
            ) : (
              <ActionForm action={checkLooseStock.bind(null, typeId)} submitLabel="Record stock check">
                <SelectField label="Lot weighed" name="lot" options={[...lots.entries()].map(([value, lot]) => ({ value, label: lotTerms(lot) }))} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Grams label="Weight on the scale (g)" name="weight" min="0" required />
                  {type.counted && <Field label="Pieces counted" name="pieces" type="number" step="1" min="0" required />}
                </div>
                <Field label="Note (optional)" name="note" type="text" placeholder="e.g. Monthly check" />
                <DateField />
              </ActionForm>
            )}
          </Card>

          <Card title="Counted in pieces" hint="Phuli and nath are kept by piece count as well as weight; mani by weight alone. When the last piece of a lot is sold, a leftover up to 0.05 g is written off by itself.">
            <CountedSwitch typeId={typeId} counted={type.counted} action={setLooseCounted} />
          </Card>
        </div>
      </div>

      <DataTable
        head={["When", "What", "Note", "Lot", "Pieces", "In", "Out"]}
        right={[4, 5, 6]}
        empty="No movements yet."
        rows={movements.map((row) => [
          dateTime(row.date),
          causes[row.sourceTable ?? ""] ?? row.sourceTable ?? "-",
          row.desc ?? "-",
          lotTerms({ melting: row.melting ?? 0, wastage: row.wastage, making: row.making }),
          row.pieces ? `${row.direction === "in" ? "+" : "−"}${row.pieces}` : "",
          row.direction === "in" && row.weight ? grams(row.weight) : "",
          row.direction === "out" && row.weight ? grams(row.weight) : "",
        ])}
      />
    </div>
  );
}
