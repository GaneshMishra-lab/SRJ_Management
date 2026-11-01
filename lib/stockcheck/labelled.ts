import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { itemStock, itemType } from "@/db/schema/sales";
import { istDayRange } from "@/lib/format";
import type { BookRow, CheckSource } from "./types";

// Labelled pieces, counted per item type. Every move in and out of stock is put on one dated list,
// so the book can be read at the end of any day, not only today:
//   in:  labelled into stock (item_stock.date), and a cancelled sale bringing the piece back;
//   out: sold (the bill's date, cancelled bills too), returned to the supplier, melted into langdi.
const moves = sql`
  select s.item_type, coalesce(s.date, s.created_at) as at, 1 as delta from item_stock s
  union all
  select s.item_type, b.date, -1 from item_sale l join item_sale_bill b on b.id = l.bill join item_stock s on s.id = l.item
  union all
  select s.item_type, b.cancelled_at, 1 from item_sale l join item_sale_bill b on b.id = l.bill join item_stock s on s.id = l.item
    where b.cancelled_at is not null
  union all
  select s.item_type, r.date, -1 from supplier_return r join item_stock s on s.id = r.item
  union all
  select s.item_type, m.date, -1 from item_stock s join langdi_ledger m on m.id = s.langdi_entry`;

export const labelled: CheckSource = {
  kind: "labelled",
  label: "Labelled",
  unit: "pieces",
  awayLabel: "On approval",

  async book(executor, metal, day, since) {
    const end = istDayRange(day).end;
    const from = since ? istDayRange(since).end : null;
    // Moves in and out after the check before, up to the end of this day.
    const window = (direction: 1 | -1) =>
      from ? sql`coalesce(sum(case when m.delta = ${direction} and m.at >= ${from} and m.at < ${end} then 1 else 0 end), 0)` : sql`null`;

    const result = await executor.execute(sql`
      select t.id, t.name,
        coalesce(sum(case when m.at < ${end} then m.delta else 0 end), 0) as expected,
        ${window(1)} as added,
        ${window(-1)} as removed,
        (select count(*) from item_approval a join item_stock s on s.id = a.item
          where s.item_type = t.id and a.date_out < ${end} and (a.date_back is null or a.date_back >= ${end})) as away
      from item_type t
      left join (${moves}) m on m.item_type = t.id
      where t.metal = ${metal} and not t.loose
      group by t.id, t.name
      order by t.name`);

    return (result.rows as Record<string, unknown>[]).map((row): BookRow => ({
      id: String(row.id),
      name: String(row.name),
      expected: Number(row.expected),
      added: row.added === null ? null : Number(row.added),
      removed: row.removed === null ? null : Number(row.removed),
      away: Number(row.away),
    }));
  },

  // The pieces in stock now, to trace a short count by label.
  async pieces(executor, metal) {
    const rows = await executor
      .select({ id: itemStock.id, subjectId: itemStock.itemType, label: itemStock.label, weight: itemStock.grossWeight, status: itemStock.status })
      .from(itemStock)
      .innerJoin(itemType, eq(itemStock.itemType, itemType.id))
      .where(and(eq(itemType.metal, metal), inArray(itemStock.status, ["stock", "on_approval"])))
      .orderBy(asc(itemStock.label));
    return rows.map(({ status, subjectId, ...row }) => ({ ...row, subjectId: subjectId ?? "", away: status === "on_approval" }));
  },
};
