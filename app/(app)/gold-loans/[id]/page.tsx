import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entity } from "@/db/schema/entities";
import { goldLoan, goldLoanPayment, oldItem } from "@/db/schema/sales";
import { addGoldLoanPayment, defaultGoldLoan } from "@/app/actions/goldloans";
import { ActionForm } from "@/components/ActionForm";
import { Card, DateField, linkClass, ModeField, PageHeader, Percent, Rupees, SelectField, Stats, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { isUuid } from "@/lib/form";
import { dateOnly, dateTime, grams, inr, parseDbDate } from "@/lib/format";
import { accruedInterest } from "@/lib/interest";
import { round2 } from "@/lib/pricing";

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

  const principalPayments = payments.filter((payment) => payment.type === "principal");
  const interestPaid = payments.filter((payment) => payment.type === "interest").reduce((sum, payment) => sum + (payment.amt ?? 0), 0);
  // Interest stops building once the loan is closed or defaulted; a default counts from the day the pledge was taken over.
  const until = loan.status === "active" ? new Date() : takenOver?.date ? parseDbDate(takenOver.date) : loan.updatedAt;
  const accrued = accruedInterest(loan, principalPayments, until);
  const principalDue = round2((loan.amt ?? 0) - (loan.amtPaid ?? 0));
  const interestDue = Math.max(0, round2(accrued - interestPaid));
  const active = loan.status === "active";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/gold-loans", label: "Gold Loans" }}
        title={<>{loan.item} <StatusBadge tone={active ? "amber" : loan.status === "closed" ? "emerald" : "red"}>{loan.status}</StatusBadge></>}
        subtitle={`${row.customerName ?? "Unknown"} · ${grams(loan.weight)} pledged on ${dateOnly(loan.date)} · ${loan.interest ?? 0}% per month${loan.desc ? ` · ${loan.desc}` : ""}`}
      />

      <Stats items={[
        { name: "Loan amount", value: inr(loan.amt) },
        { name: "Principal due", value: inr(principalDue) },
        { name: "Interest so far", value: inr(accrued) },
        { name: "Interest unpaid", value: inr(interestDue) },
      ]} />

      {loan.status === "closed" && interestDue > 0 && (
        <p className="text-sm text-accent">Principal is fully repaid, but {inr(interestDue)} of interest was never collected.</p>
      )}
      {takenOver && (
        <p className="text-sm text-fg-2">The pledge was taken over as <Link href={`/old-gold/${takenOver.id}`} className={linkClass}>old metal</Link>.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Payments">
          {payments.length === 0 ? <p className="text-sm text-fg-3">No payments yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {payments.map((payment) => (
                <li key={payment.id} className="flex justify-between py-2">
                  <span className="text-fg-2">{dateTime(payment.date)} · {payment.type} · {payment.mode}</span>
                  <span className="text-fg">{inr(payment.amt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {active && (
          <Card title="Receive payment" hint="Repaying all the principal closes the loan and releases the pledge.">
            <ActionForm action={addGoldLoanPayment.bind(null, id)} submitLabel="Record payment">
              <SelectField label="Towards" name="type" options={[{ value: "interest", label: "Interest" }, { value: "principal", label: "Principal" }]} />
              <Rupees label="Amount (₹)" name="amt" required />
              <ModeField label="Received in" />
              <DateField />
            </ActionForm>
          </Card>
        )}

        {active && (
          <Card title="Customer defaulted" hint={`The pledge becomes the shop's old metal at ${inr(principalDue + interestDue)} (principal plus unpaid interest). This cannot be undone.`}>
            <ActionForm action={defaultGoldLoan.bind(null, id)} submitLabel="Take over pledge">
              <SelectField label="Metal" name="metal" options={["Gold", "Silver", "Phuli"]} />
              <Percent label="Melting (%)" name="melting" min="0.001" required />
              <DateField />
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
