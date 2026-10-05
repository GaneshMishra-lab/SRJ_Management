import Link from "next/link";
import { asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { itemOrder, itemPurchased, itemStock, itemType } from "@/db/schema/sales";
import { SaleForm } from "@/components/SaleForm";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, inr, istDate } from "@/lib/format";
import { getCurrentRates } from "@/lib/ledger";
import { cardClass, inputClass, labelClass } from "@/lib/styles";

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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">New Sale</h1>
        <p className="text-zinc-400 mt-1">
          Fine rates in use: Gold {rates.Gold ? inr(rates.Gold.rate) : "not set"} · Silver {rates.Silver ? inr(rates.Silver.rate) : "not set"} per gram.
        </p>
        {stale.length > 0 && (
          <p className="mt-2 text-sm text-amber-500">
            {backdated ? `The ${stale.join(" and ")} rate for ${dateOnly(day)} was not entered` : `Today's ${stale.join(" and ")} rate has not been entered`}
            {stale.map((metal) => rates[metal] ? `; using ${metal} rate of ${dateOnly(rates[metal]!.date)}` : "").join("")}.
            Set it on the <Link href="/dashboard" className="underline">dashboard</Link>.
          </p>
        )}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <label htmlFor="date" className={labelClass}>Bill date</label>
          <input id="date" name="date" type="date" defaultValue={day} max={today} className={inputClass} />
        </div>
        <button type="submit" className="px-5 py-2.5 rounded-xl border border-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-900 transition-colors">
          Use this date
        </button>
        <p className="basis-full text-sm text-zinc-500">
          For a sale being entered later, set its date first: that day&apos;s rates are used, and changing the date clears the bill below.
        </p>
      </form>

      <div className={cardClass}>
        <SaleForm
          key={day}
          date={backdated ? day : undefined}
          customers={customers}
          pieces={pieces}
          rates={{ Gold: rates.Gold?.rate ?? null, Silver: rates.Silver?.rate ?? null }}
          orders={orders}
        />
      </div>
    </div>
  );
}
