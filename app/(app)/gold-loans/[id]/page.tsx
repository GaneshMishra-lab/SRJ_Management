import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { goldLoan, goldLoanPayment, oldItem } from "@/db/schema/sales";
import { addGoldLoanPayment, clearGoldLoan, defaultGoldLoan, giveMoreOnGoldLoan } from "@/app/actions/goldloans";
import { ActionForm } from "@/components/ActionForm";
import { ActionPanels } from "@/components/ActionPanels";
import { Card, DateField, Field, linkClass, ModeField, PageHeader, Percent, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, grams, inr, parseDbDate } from "@/lib/format";
import { loanFigures, PENALTY_GRACE_MONTHS, penaltyStartsOn } from "@/lib/interest";

export default async function GoldLoanPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({ loan: goldLoan, customerName: entity.name })
    .from(goldLoan)
    .leftJoin(entity, eq(goldLoan.customer, entity.id))
    .where(eq(goldLoan.id, id));
  if (!row) notFound();

  const { loan } = row;
  const payments = await db.select().from(goldLoanPayment).where(eq(goldLoanPayment.loan, id)).orderBy(asc(goldLoanPayment.date));
  const [takenOver] = await db.select({ id: oldItem.id, date: oldItem.date }).from(oldItem).where(eq(oldItem.goldLoan, id));

  // Interest stops building once the loan is closed or defaulted: at the day it was cleared, or the
  // day the pledge was taken over.
  const lastPrincipal = payments.filter((payment) => payment.type === "principal").at(-1)?.date;
  const until = loan.status === "active" ? new Date()
    : takenOver?.date ? parseDbDate(takenOver.date)
    : lastPrincipal ? parseDbDate(lastPrincipal) : loan.updatedAt;
  const { firstAmt, accrued, months, discount, principalDue, interestDue, penalty, penaltyExtra, penaltyWaived, penaltyDue } = loanFigures(loan, payments, until);
  const gaveMore = firstAmt !== (loan.amt ?? 0);
  const active = loan.status === "active";
  const totalDue = principalDue + interestDue + penaltyDue;
  const penaltyFrom = active && penalty === 0 ? penaltyStartsOn(loan, payments, until) : null;
  const labels: Record<string, string> = { topup: "more given", penalty_waiver: "penalty lowered", penalty_extra: "penalty raised" };
  const typeLabel = (type: string | null) => (type ? labels[type] ?? type : "");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/gold-loans", label: "Gold Loans" }}
        title={<>{loan.item} <StatusBadge tone={active ? "amber" : loan.status === "closed" ? "emerald" : "red"}>{loan.status}</StatusBadge></>}
        subtitle={`${row.customerName ?? "Unknown"} · ${grams(loan.weight)} pledged on ${dateOnly(loan.date)} · ${loan.interest ?? 0}% per month${loan.desc ? ` · ${loan.desc}` : ""}`}
      />

      <Stats items={[
        { name: gaveMore ? "Total given" : "Loan amount", value: inr(loan.amt), note: gaveMore ? `${inr(firstAmt)} at first` : undefined },
        { name: "Principal due", value: inr(principalDue) },
        { name: "Interest so far", value: inr(accrued), note: `${months} ${months === 1 ? "month" : "months"}` },
        { name: "Interest unpaid", value: inr(interestDue), note: discount > 0 ? `${inr(discount)} let go as discount` : undefined },
        ...(active || penalty > 0 || penaltyExtra > 0 ? [{
          name: "Penalty unpaid", value: inr(penaltyDue), tone: penaltyDue > 0 ? "warn" as const : undefined,
          note: penalty > 0 || penaltyExtra > 0
            ? [`${inr(penalty)} by the rule`, penaltyExtra > 0 && `${inr(penaltyExtra)} added`, penaltyWaived > 0 && `${inr(penaltyWaived)} let go`].filter(Boolean).join(" · ")
            : penaltyFrom ? `Starts ${dateOnly(penaltyFrom)} if unpaid` : "None: interest is up to date",
        }] : []),
      ]} />
      {active && (
        <p className="text-sm text-fg-3">
          Interest left unpaid for more than {PENALTY_GRACE_MONTHS} months after it falls due earns penalty at {loan.interest ?? 0}% a month. Paying interest clears the oldest first.
        </p>
      )}

      {loan.status === "closed" && interestDue > 0 && (
        <p className="text-sm text-accent">Principal is fully repaid, but {inr(interestDue)} of interest was never collected.</p>
      )}
      {takenOver && (
        <p className="text-sm text-fg-2">The pledge was taken over as <Link href={`/old-gold/${takenOver.id}`} className={linkClass}>old metal</Link>.</p>
      )}

      {active && (
        <ActionPanels panels={[
          {
            key: "payment", label: "Receive payment", title: "Receive part payment",
            hint: "Interest, or part of the principal. Principal repaid lowers interest from the next month.",
            children: (
              <ActionForm action={addGoldLoanPayment.bind(null, id)} submitLabel="Record payment">
                <SelectField label="Towards" name="type" options={[
                  { value: "interest", label: "Interest" },
                  { value: "principal", label: "Principal" },
                  ...(penaltyDue > 0 ? [{ value: "penalty", label: "Penalty" }] : []),
                ]} />
                <Rupees label="Amount (₹)" name="amt" required />
                <ModeField label="Received in" />
                <DateField />
              </ActionForm>
            ),
          },
          {
            key: "more", label: "Give more money", title: "Give more money",
            hint: "Added to this loan. Interest is charged on it for the whole month of the loan it is taken in.",
            children: (
              <ActionForm action={giveMoreOnGoldLoan.bind(null, id)} submitLabel="Give more">
                <Rupees label="Amount (₹)" name="amt" required />
                <ModeField label="Paid from" />
                <DateField />
              </ActionForm>
            ),
          },
          {
            key: "clear", label: "Clear girvi", title: "Clear girvi",
            hint: `Takes the ${inr(principalDue)} of principal due and the interest and penalty the customer pays. Interest not taken is written as a discount. The penalty can be lowered or raised; the change is recorded. This closes the loan; return the pledge.`,
            children: (
              <ActionForm action={clearGoldLoan.bind(null, id)} submitLabel="Clear and return pledge">
                <p className="text-sm text-fg-2">
                  Due today: {inr(principalDue)} principal + {inr(interestDue)} interest{penaltyDue > 0 && <> + {inr(penaltyDue)} penalty</>} = <span className="font-medium text-fg">{inr(totalDue)}</span>
                </p>
                <Rupees label="Interest taken (₹)" name="interest" min="0" max={String(interestDue)} defaultValue={String(interestDue)} required />
                <Rupees
                  label="Penalty taken (₹)" name="penalty" min="0" defaultValue={String(penaltyDue)} required
                  hint={`${inr(penaltyDue)} by the rule. Lower it to let some go, or raise it to charge more.`}
                />
                <Field label="Reason (optional)" name="desc" type="text" placeholder="e.g. penalty reduced on request" />
                <ModeField label="Received in" />
                <DateField />
              </ActionForm>
            ),
          },
          {
            key: "default", label: "Customer defaulted", title: "Customer defaulted", danger: true,
            hint: `The pledge becomes the shop's old metal at ${inr(totalDue)} (principal plus unpaid interest${penaltyDue > 0 ? " and penalty" : ""}). This cannot be undone.`,
            children: (
              <ActionForm action={defaultGoldLoan.bind(null, id)} submitLabel="Take over pledge" tone="danger">
                <SelectField label="Metal" name="metal" options={["Gold", "Silver", "Phuli"]} />
                <Percent label="Melting (%)" name="melting" min="0.001" required />
                <DateField />
              </ActionForm>
            ),
          },
        ]} />
      )}

      <Card title="Payments" className="max-w-2xl">
        {payments.length === 0 ? <p className="text-sm text-fg-3">No payments yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {payments.map((payment) => (
              <li key={payment.id} className="flex justify-between py-2">
                <span className="text-fg-2">{dateTime(payment.date)} · {typeLabel(payment.type)}{payment.mode ? ` · ${payment.mode}` : ""}</span>
                <span className="text-fg">{inr(payment.amt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
