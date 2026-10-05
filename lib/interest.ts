import { parseDbDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";

const DAY_MS = 24 * 60 * 60 * 1000;

// Simple interest at a monthly rate, charged per day (a month counted as 30 days) on the
// principal outstanding at the time, so each principal repayment lowers what accrues after it.
export function accruedInterest(
  loan: { date: string | null; amt: number | null; interest: number | null },
  principalPayments: { date: string | null; amt: number | null }[],
  until = new Date(),
) {
  if (!loan.date) return 0;
  const steps = principalPayments
    .filter((payment) => payment.date)
    .map((payment) => ({ at: parseDbDate(payment.date!).getTime(), amt: payment.amt ?? 0 }))
    .sort((a, b) => a.at - b.at);

  let principal = loan.amt ?? 0;
  let from = parseDbDate(loan.date).getTime();
  let interest = 0;
  const perDay = (loan.interest ?? 0) / 100 / 30;

  for (const step of [...steps, { at: until.getTime(), amt: 0 }]) {
    const days = Math.max(0, (Math.min(step.at, until.getTime()) - from) / DAY_MS);
    interest += principal * perDay * days;
    principal = Math.max(0, principal - step.amt);
    from = Math.max(from, step.at);
  }
  return round2(interest);
}
