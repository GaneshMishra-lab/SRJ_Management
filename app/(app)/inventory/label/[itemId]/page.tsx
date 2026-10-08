import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { bill, itemPurchased, itemStock, itemType, looseStockLedger } from "@/db/schema/sales";
import { addPurchasedToLoose, addPurchasedToStock } from "@/app/actions/stock";
import { looseFromPurchase, looseOfPurchase } from "@/lib/loose";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, Field, Grams, Notice, PageHeader, Percent, SelectField, Stats } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, grams, inr } from "@/lib/format";
import { btn, linkClass } from "@/lib/styles";

export default async function LabelItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  await getCurrentUser();
  const { itemId } = await params;
  if (!isUuid(itemId)) notFound();

  const [row] = await db
    .select({ item: itemPurchased, bill, supplierName: entity.name, typeName: itemType.name, loose: itemType.loose })
    .from(itemPurchased)
    .innerJoin(bill, eq(itemPurchased.bill, bill.id))
    .leftJoin(entity, eq(bill.supplier, entity.id))
    .leftJoin(itemType, eq(itemPurchased.itemType, itemType.id))
    .where(eq(itemPurchased.id, itemId));
  if (!row) notFound();

  const { item } = row;
  const [piece] = await db
    .select({ id: itemStock.id, label: itemStock.label, netWeight: itemStock.netWeight, typeName: itemType.name })
    .from(itemStock)
    .leftJoin(itemType, eq(itemStock.itemType, itemType.id))
    .where(eq(itemStock.item, itemId));
  // Loose metal (mani) is not labelled: it went into the stock of its type by weight.
  const [inLoose] = await db
    .select({ typeId: itemType.id, typeName: itemType.name, weight: looseStockLedger.weight, melting: looseStockLedger.melting })
    .from(looseStockLedger)
    .innerJoin(itemType, eq(looseStockLedger.itemType, itemType.id))
    .where(looseOfPurchase(itemId));

  // The next item on the same bill still waiting to go into stock.
  const [next] = await db
    .select({ id: itemPurchased.id })
    .from(itemPurchased)
    .leftJoin(itemStock, eq(itemStock.item, itemPurchased.id))
    .leftJoin(looseStockLedger, looseFromPurchase)
    .where(and(eq(itemPurchased.bill, row.bill.id), ne(itemPurchased.id, itemId), isNull(itemStock.id), isNull(looseStockLedger.id)))
    .orderBy(asc(itemPurchased.createdAt))
    .limit(1);

  // An item billed as a loose type goes into loose stock; any other is labelled as a piece.
  const types = await db.select().from(itemType)
    .where(and(eq(itemType.metal, row.bill.metal ?? ""), eq(itemType.loose, !!row.loose)))
    .orderBy(asc(itemType.name));

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: `/purchases/${row.bill.id}`, label: "the bill" }}
        title={piece ? `${piece.typeName ?? "Piece"} #${piece.label}` : inLoose ? `${inLoose.typeName ?? "Loose metal"} · loose` : row.loose ? `Add ${row.typeName ?? "item"} to loose stock` : `Label ${row.typeName ?? "item"}`}
        subtitle={`${row.bill.metal} bill of ${dateOnly(row.bill.date)} from ${row.supplierName ?? "unknown supplier"}`}
      />

      <Stats items={[
        { name: "Billed gross", value: grams(item.grossWeight) },
        { name: "Billed net", value: grams(item.netWeight) },
        { name: "Billed melting", value: `${item.melting ?? 0}%` },
        { name: "Billed amount", value: inr(item.amt) },
      ]} />

      {piece ? (
        <>
          <Notice title={`In stock as ${piece.typeName ?? "Piece"} #${piece.label}`}>
            Write this number on the tag. The piece is in stock at {grams(piece.netWeight)} net.
          </Notice>
          <div className="flex flex-wrap gap-2">
            {next && <Link href={`/inventory/label/${next.id}`} className={btn()}>Label the next item on this bill</Link>}
            <Link href={`/inventory/${piece.id}`} className={btn("secondary")}>Open the piece</Link>
            <Link href="/inventory/label" className={btn("secondary")}>All items to label</Link>
          </div>
        </>
      ) : inLoose ? (
        <>
          <Notice title={`In loose stock of ${inLoose.typeName ?? "its type"}`}>
            {grams(inLoose.weight)} at {inLoose.melting ?? 0}% melting was added to the stock of this type. It is sold by weight and carries no label.
          </Notice>
          <div className="flex flex-wrap gap-2">
            {next && <Link href={`/inventory/label/${next.id}`} className={btn()}>Add the next item on this bill</Link>}
            <Link href={`/inventory/loose/${inLoose.typeId}`} className={btn("secondary")}>Open the loose stock</Link>
            <Link href="/inventory/label" className={btn("secondary")}>All items to label</Link>
          </div>
        </>
      ) : row.loose ? (
        <Card title="Add to loose stock" hint="Filled in from the bill. Correct the weight to what the scale shows; the bill keeps its own figures. The weight joins the stock of its type at this melting, and no label is given.">
          <ActionForm action={addPurchasedToLoose.bind(null, itemId)} submitLabel="Add to loose stock">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <SelectField label="Item type" name="itemType" className="col-span-2" defaultValue={item.itemType ?? undefined} options={types.map((type) => ({ value: type.id, label: type.name }))} />
              <Grams label="Weight (g)" name="weight" defaultValue={item.netWeight ?? undefined} required />
              <Percent label="Melting (%)" name="melting" min="0.001" defaultValue={item.melting ?? undefined} required />
            </div>
            <DateField />
          </ActionForm>
        </Card>
      ) : (
        <Card title="Add to stock" hint="Filled in from the bill. Correct anything that differs on the scale; the bill keeps its own figures. The piece gets the next label number of its item type.">
          {types.length === 0 ? (
            <p className="text-sm text-fg-3">There are no {row.bill.metal?.toLowerCase()} item types yet. Create one in <Link href="/inventory" className={linkClass}>Inventory</Link> first.</p>
          ) : (
            <ActionForm action={addPurchasedToStock.bind(null, itemId)} submitLabel="Add to stock">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <SelectField label="Item type" name="itemType" className="col-span-2" defaultValue={item.itemType ?? undefined} options={types.map((type) => ({ value: type.id, label: type.name }))} />
                <Grams label="Gross weight (g)" name="grossWeight" defaultValue={item.grossWeight ?? undefined} required />
                <Grams label="Net weight (g)" name="netWeight" defaultValue={item.netWeight ?? undefined} placeholder="same as gross" />
                <Percent label="Melting (%)" name="melting" min="0.001" defaultValue={item.melting ?? undefined} required />
                <Field label="HUID (optional)" name="huid" type="text" />
              </div>
              <DateField />
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
