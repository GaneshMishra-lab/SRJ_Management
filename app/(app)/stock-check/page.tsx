import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/entities";
import { stockCheck, stockCheckLine } from "@/db/schema/stockcheck";
import { StockCheckGrid, type SavedCheck } from "@/components/StockCheckGrid";
import { getCurrentUser } from "@/lib/dal";
import { istDate } from "@/lib/format";
import { checkMetals, checkSources, laterKinds } from "@/lib/stockcheck";

const HISTORY = 4; // earlier checks shown beside this one, as on a page of the register

// The stock register: rows are item types, and each check is a dated column of added, gone and
// what is there, with the locker count written small beside it.
export default async function StockCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await getCurrentUser();
  const params = await searchParams;
  const pick = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");

  const kind = checkSources[pick("kind")] ? pick("kind") : "labelled";
  const metal = (checkMetals as readonly string[]).includes(pick("metal")) ? pick("metal") : "Gold";
  const today = istDate();
  const requested = pick("date");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  const source = checkSources[kind];

  const checks = await db
    .select({ id: stockCheck.id, date: stockCheck.date, note: stockCheck.note, by: users.name })
    .from(stockCheck)
    .leftJoin(users, eq(stockCheck.checkedBy, users.id))
    .where(and(eq(stockCheck.kind, kind), eq(stockCheck.metal, metal), lte(stockCheck.date, day)))
    .orderBy(desc(stockCheck.date))
    .limit(HISTORY + 1);
  const lines = checks.length
    ? await db.select().from(stockCheckLine).where(inArray(stockCheckLine.check, checks.map((check) => check.id))).orderBy(asc(stockCheckLine.subjectName))
    : [];
  const saved: SavedCheck[] = checks.map((check) => ({
    ...check,
    lines: Object.fromEntries(lines.filter((line) => line.check === check.id).map((line) => [line.subjectId, line])),
  }));

  const current = saved[0]?.date === day ? saved[0] : null;
  const history = saved.filter((check) => check !== current).slice(0, HISTORY).reverse();
  const before = history.at(-1) ?? null;

  const book = await source.book(db, metal, day, before?.date ?? null);
  // A row with nothing in it and no past count stays off the page.
  const rows = book.filter((row) =>
    row.expected || row.added || row.removed || row.away || saved.some((check) => check.lines[row.id]));
  const pieces = source.pieces ? await source.pieces(db, metal) : [];

  return (
    <StockCheckGrid
      key={`${kind}-${metal}-${day}`}
      kinds={[
        ...Object.values(checkSources).map((s) => ({ kind: s.kind, label: s.label })),
        ...laterKinds.map((later) => ({ ...later, later: true })),
      ]}
      kind={kind}
      metal={metal}
      day={day}
      today={today}
      unit={source.unit}
      awayLabel={source.awayLabel}
      rows={rows}
      history={history}
      current={current}
      pieces={pieces}
    />
  );
}
