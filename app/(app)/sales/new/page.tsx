import Link from "next/link";
import { asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemOrder, itemPurchased, itemStock, itemType } from "@/db/schema/sales";
import { Notice, PageHeader } from "@/components/ui";
import { SaleForm } from "@/components/SaleForm";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, inr, istDate } from "@/lib/format";
import { getCurrentRates } from "@/lib/ledger";
import { btn, inputClass, linkClass } from "@/lib/styles";

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await getCurrentUser();

  // A sale written up later is billed on its own day, at that day's rates.
  const today = istDate();
  const requested = (await searchParams).date;
  const day = typeof requested === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  const backdated = day !== today;

  const customers = await db
    .select({ id: entity.id, name: entity.name })
    .from(entity)
    .where(eq(entity.type, "customer"))
    .orderBy(asc(entity.name));

  const pieces = await db
    .select({
      id: itemStock.id,
      label: itemStock.label,
      typeName: itemType.name,
      metal: itemStock.metal,
      netWeight: itemStock.netWeight,
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

  const rates = await getCurrentRates(day);
  const stale = (["Gold", "Silver"] as const).filter((metal) => !rates[metal]?.isToday);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New sale"
        subtitle={`Fine rates${backdated ? ` on ${dateOnly(day)}` : " today"}: gold ${rates.Gold ? inr(rates.Gold.rate) : "not set"} · silver ${rates.Silver ? inr(rates.Silver.rate) : "not set"} per gram`}
        back={{ href: "/sales", label: "Sales" }}
      >
        {/* A sale written up later is billed on its own day, at that day's rates. Changing the day starts the bill afresh. */}
        <form method="get" className="flex items-center gap-2" title="For a sale being entered later, set its date first: that day's rates are used, and changing the date clears the bill.">
          <label htmlFor="bill-date" className="text-[13px] font-medium whitespace-nowrap text-fg-2">Bill date</label>
          <input id="bill-date" name="date" type="date" defaultValue={day} max={today} className={`${inputClass} w-44`} />
          <button type="submit" className={btn("secondary")}>Apply</button>
        </form>
      </PageHeader>

      {stale.length > 0 && (
        <Notice tone="warn">
          {backdated ? `The ${stale.join(" and ")} rate for ${dateOnly(day)} was not entered` : `Today's ${stale.join(" and ")} rate has not been entered`}
          {stale.map((metal) => rates[metal] ? `; using ${metal} rate of ${dateOnly(rates[metal]!.date)}` : "").join("")}.
          {" "}Set it on the <Link href="/dashboard" className={linkClass}>dashboard</Link>.
        </Notice>
      )}

      <SaleForm
        key={day}
        date={backdated ? day : undefined}
        customers={customers}
        pieces={pieces}
        rates={{ Gold: rates.Gold?.rate ?? null, Silver: rates.Silver?.rate ?? null }}
        orders={orders}
      />
    </div>
  );
}
