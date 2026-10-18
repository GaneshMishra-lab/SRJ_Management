import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { itemType, looseStockLedger } from "@/db/schema/sales";
import { checkLooseStock } from "@/app/actions/stock";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, Field, Grams, PageHeader, SelectField, Stats } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateTime, grams } from "@/lib/format";
import { looseBalances, loosePieces } from "@/lib/loose";
import { round3 } from "@/lib/pricing";

const causes: Record<string, string> = {
  item_purchased: "Purchase",
  item_sale: "Sale",
  sale_cancel: "Sale cancelled",
  stock_check: "Stock check",
  opening: "Opening stock",
};

// One loose type (a kind of mani): what is on hand by melting, and every movement in and out.
export default async function LooseStockPage({ params }: { params: Promise<{ typeId: string }> }) {
  await getCurrentUser();
  const { typeId } = await params;
  if (!isUuid(typeId)) notFound();

  const [type] = await db.select().from(itemType).where(eq(itemType.id, typeId));
  if (!type?.loose) notFound();

  const onHand = await looseBalances(db, [typeId]);
  const weight = round3(onHand.reduce((sum, row) => sum + row.weight, 0));
  const about = loosePieces(weight, type.piecesPerGram);

  const movements = await db
    .select()
    .from(looseStockLedger)
    .where(eq(looseStockLedger.itemType, typeId))
    .orderBy(desc(looseStockLedger.date), desc(looseStockLedger.createdAt))
    .limit(200);
  // Every melting this type has ever been kept at, so one that has run out can still be weighed.
  const meltings = [...new Set([...onHand.map((row) => row.melting), ...movements.map((row) => row.melting ?? 0)])].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/inventory", label: "Inventory" }}
        title={type.name}
        subtitle={`Loose ${type.metal?.toLowerCase() ?? "metal"}, kept and sold by weight${type.piecesPerGram ? ` · ${type.piecesPerGram} pieces to the gram` : ""}`}
      />

      <Stats items={[
        { name: "In stock", value: grams(weight) },
        { name: "About", value: about === null ? "-" : `${about} pieces`, note: about === null ? "Pieces to the gram not set" : "By weight, not counted" },
        { name: "Meltings in stock", value: onHand.length },
      ]} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <DataTable
          head={["Melting", "About", "In stock"]}
          right={[1, 2]}
          empty="None of this type is in stock."
          rows={onHand.map((row) => [
            `${row.melting}%`,
            loosePieces(row.weight, type.piecesPerGram) === null ? "-" : `${loosePieces(row.weight, type.piecesPerGram)} pieces`,
            grams(row.weight),
          ])}
        />

        <Card title="Stock check" hint="Weigh what is in the box and enter it. The book is brought to that weight, and the difference is written below as its own entry.">
          {meltings.length === 0 ? (
            <p className="text-sm text-fg-3">Nothing has been added to this type yet. It comes in from a supplier&apos;s purchase bill.</p>
          ) : (
            <ActionForm action={checkLooseStock.bind(null, typeId)} submitLabel="Record stock check">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField label="Melting weighed" name="melting" options={meltings.map((melting) => ({ value: String(melting), label: `${melting}%` }))} />
                <Grams label="Weight on the scale (g)" name="weight" min="0" required />
              </div>
              <Field label="Note (optional)" name="note" type="text" placeholder="e.g. Monthly check" />
              <DateField />
            </ActionForm>
          )}
        </Card>
      </div>

      <DataTable
        head={["When", "What", "Note", "Melting", "In", "Out"]}
        right={[3, 4, 5]}
        empty="No movements yet."
        rows={movements.map((row) => [
          dateTime(row.date),
          causes[row.sourceTable ?? ""] ?? row.sourceTable ?? "-",
          row.desc ?? "-",
          `${row.melting ?? 0}%`,
          row.direction === "in" ? grams(row.weight) : "",
          row.direction === "out" ? grams(row.weight) : "",
        ])}
      />
    </div>
  );
}
