import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { SaleForm } from "@/components/SaleForm";
import { saleFormData } from "@/lib/bill-forms";
import { getCurrentUser } from "@/lib/dal";
import { dateOnly, inr, istDate } from "@/lib/format";
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

  const { customers, pieces, loose, orders, rates } = await saleFormData(day);
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
        loose={loose}
        rates={{ Gold: rates.Gold?.rate ?? null, Silver: rates.Silver?.rate ?? null }}
        orders={orders}
      />
    </div>
  );
}
