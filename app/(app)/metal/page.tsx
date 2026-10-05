import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { dailyMetalBalance, metalLedger } from "@/db/schema/ledger";
import { langdiLedger } from "@/db/schema/sales";
import { adjustMetal, closeMetalDay, sellLangdi, setTestedPurity, tradeBullion, tradeLangdi } from "@/app/actions/metal";
import { ActionForm } from "@/components/ActionForm";
import { Card, DataTable, DateField, EntityFields, Field, Grams, ModeField, PageHeader, Percent, Rupees, SelectField, Stats } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { listEntities } from "@/lib/entities";
import { dateTime, grams, inr, istDate, istDayRange } from "@/lib/format";
import { BULLION_STANDARDS, langdiBalances, metalBalances, METALS } from "@/lib/metal";
import { round3 } from "@/lib/pricing";
import { inputClass } from "@/lib/styles";

const metalOptions = [...METALS];
const standardOptions = [...BULLION_STANDARDS];

export default async function MetalPage() {
  const user = await getCurrentUser();

  const today = istDate();
  const { start, end } = istDayRange(today);
  const balance = await metalBalances();
  const opening = await metalBalances(start);
  const closing = await metalBalances(end);
  const langdi = await langdiBalances();
  const dealers = await listEntities(["supplier"]);
  const closings = await db.select().from(dailyMetalBalance).where(eq(dailyMetalBalance.date, today));

  const metalEntries = await db.select().from(metalLedger).orderBy(desc(metalLedger.date), desc(metalLedger.createdAt)).limit(30);
  const langdiEntries = await db
    .select({ entry: langdiLedger, partyName: entity.name })
    .from(langdiLedger)
    .leftJoin(entity, eq(langdiLedger.entity, entity.id))
    .orderBy(desc(langdiLedger.date), desc(langdiLedger.createdAt))
    .limit(30);

  const pools = METALS.flatMap((metal) => BULLION_STANDARDS.map((standard) => ({ metal, standard })));

  return (
    <div className="space-y-6">
      <PageHeader title="Metal & Langdi" subtitle="Fine bullion in hand by standard, and melted langdi by weight." />

      <Stats items={[
        ...pools.filter((p) => p.metal === "Gold").map((p) => ({ name: `Gold ${p.standard}`, value: grams(balance(p.metal, p.standard)) })),
        { name: "Gold langdi", value: grams(langdi("Gold")) },
        { name: "Silver langdi", value: grams(langdi("Silver")) },
      ]} />
      <Stats items={pools.filter((p) => p.metal === "Silver").map((p) => ({ name: `Silver ${p.standard}`, value: grams(balance(p.metal, p.standard)) }))} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Buy or sell bullion" hint="For cash or online. Amount is weight × rate.">
          <ActionForm action={tradeBullion} submitLabel="Record bullion trade">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectField label="Type" name="type" options={[{ value: "purchase", label: "Buy" }, { value: "sale", label: "Sell" }]} />
              <SelectField label="Metal" name="metal" options={metalOptions} />
              <SelectField label="Standard" name="standard" options={standardOptions} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Grams label="Weight (g)" name="weight" required />
              <Rupees label="Rate (₹/g)" name="rate" required />
              <ModeField label="Paid by" />
            </div>
            <EntityFields label="Dealer" entities={dealers} newLabel="Or a new dealer" />
            <DateField />
          </ActionForm>
        </Card>

        <Card title="Trade langdi for bullion" hint="Fine received = (weight − deduction) × tested purity ÷ standard.">
          <ActionForm action={tradeLangdi} submitLabel="Record langdi trade">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label="Metal" name="metal" options={metalOptions} />
              <SelectField label="Standard received" name="standard" options={standardOptions} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Grams label="Langdi weight (g)" name="weight" required />
              <Percent label="Tested purity (%)" name="testedPurity" required />
              <Grams label="Deduction (g)" name="deduction" min="0" defaultValue="0" />
            </div>
            <EntityFields label="Dealer" entities={dealers} newLabel="Or a new dealer" />
            <DateField />
          </ActionForm>
        </Card>

        <Card title="Sell langdi for cash">
          <ActionForm action={sellLangdi} submitLabel="Record langdi sale">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectField label="Metal" name="metal" options={metalOptions} />
              <Grams label="Weight (g)" name="weight" required />
              <Percent label="Tested purity (%)" name="testedPurity" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Rupees label="Amount received (₹)" name="amt" required />
              <ModeField label="Received in" />
            </div>
            <EntityFields label="Buyer" entities={dealers} newLabel="Or a new buyer" />
            <DateField />
          </ActionForm>
        </Card>

        {user.role === "owner" && (
          <Card title="Adjustment" hint="Opening stock and corrections. Owner only.">
            <ActionForm action={adjustMetal} submitLabel="Record adjustment">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SelectField label="What" name="kind" options={[{ value: "995", label: "Fine 995" }, { value: "999", label: "Fine 999" }, { value: "langdi", label: "Langdi" }]} />
                <SelectField label="Metal" name="metal" options={metalOptions} />
                <SelectField label="Type" name="direction" options={[{ value: "in", label: "Add" }, { value: "out", label: "Remove" }]} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Grams label="Weight (g)" name="weight" required />
                <Percent label="Purity % (langdi only)" name="purity" />
              </div>
              <Field label="Reason" name="desc" type="text" placeholder="e.g. Opening stock" required />
            </ActionForm>
          </Card>
        )}
      </div>

      <Card title={`Today's fine metal tally`} hint="Weigh what is in hand and compare with the ledger. The ledger is not changed.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pools.map((pool) => {
            const saved = closings.find((row) => row.metal === pool.metal && row.standard === pool.standard);
            // Entries made after the weighing move the ledger closing, so compare afresh.
            const difference = saved ? round3((saved.actualClosing ?? 0) - closing(pool.metal, pool.standard)) : 0;
            return (
              <div key={`${pool.metal}-${pool.standard}`} className="rounded-xl border border-line p-4">
                <p className="font-medium text-fg">{pool.metal} {pool.standard}</p>
                <p className="mt-1 text-sm text-fg-2">
                  Opening {grams(opening(pool.metal, pool.standard))} · closing by ledger {grams(closing(pool.metal, pool.standard))}
                  {saved && <> · weighed {grams(saved.actualClosing)} · difference <span className={difference === 0 ? "text-ok" : "text-bad"}>{grams(difference)}</span></>}
                </p>
                <ActionForm action={closeMetalDay} submitLabel={saved ? "Update" : "Save"} className="mt-3 flex items-end gap-3">
                  <input type="hidden" name="date" value={today} />
                  <input type="hidden" name="metal" value={pool.metal} />
                  <input type="hidden" name="standard" value={pool.standard} />
                  <input name="actual" type="number" step="0.001" min="0" placeholder="Weighed closing (g)" aria-label={`Weighed closing for ${pool.metal} ${pool.standard}`} className={`${inputClass} min-w-0`} required />
                </ActionForm>
              </div>
            );
          })}
        </div>
      </Card>

      <h2 className="text-lg font-semibold text-fg pt-2">Langdi ledger</h2>
      <DataTable
        head={["Time", "Metal", "Details", "In", "Out", "Purity", "Fine"]}
        right={[3, 4]}
        empty="No langdi movement yet."
        rows={langdiEntries.map(({ entry, partyName }) => [
          <span key="t" className="whitespace-nowrap">{dateTime(entry.date)}</span>,
          entry.metal,
          <span key="d" className="text-fg">{entry.desc}{partyName ? ` · ${partyName}` : ""}{entry.amt ? ` · ${inr(entry.amt)}` : ""}</span>,
          <span key="i" className="text-ok">{entry.direction === "in" ? grams(entry.weight) : ""}</span>,
          <span key="o" className="text-bad">{entry.direction === "out" ? grams(entry.weight) : ""}</span>,
          entry.direction === "in" ? (
            <div key="p" className="space-y-2">
              <p>est. {entry.estPurity ?? "-"}%{entry.testedPurity ? ` · tested ${entry.testedPurity}%` : ""}</p>
              <ActionForm action={setTestedPurity.bind(null, entry.id)} submitLabel="Set" className="flex items-center gap-2">
                <input name="testedPurity" type="number" step="0.001" min="0.001" max="100" placeholder="Tested %" aria-label="Tested purity" className="w-28 rounded-lg bg-card border-line text-sm px-3 py-2 text-fg outline-none" required />
              </ActionForm>
            </div>
          ) : (entry.testedPurity ? `${entry.testedPurity}%` : "-"),
          entry.fineWeight ? `${grams(entry.fineWeight)} (${entry.standard})` : "-",
        ])}
      />

      <h2 className="text-lg font-semibold text-fg pt-2">Fine metal ledger</h2>
      <DataTable
        head={["Time", "Metal", "Details", "In", "Out"]}
        right={[3, 4]}
        empty="No fine metal movement yet."
        rows={metalEntries.map((entry) => [
          <span key="t" className="whitespace-nowrap">{dateTime(entry.date)}</span>,
          `${entry.metal} ${entry.standard}`,
          <span key="d" className="text-fg">{entry.desc}</span>,
          <span key="i" className="text-ok">{entry.direction === "in" ? grams(entry.weight) : ""}</span>,
          <span key="o" className="text-bad">{entry.direction === "out" ? grams(entry.weight) : ""}</span>,
        ])}
      />
    </div>
  );
}
