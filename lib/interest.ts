import { istDate, parseDbDate } from "@/lib/format";
import { round2 } from "@/lib/pricing";

// Girvi interest is simple, at a monthly rate, counted in whole months from the day the loan
// was given: 12 Apr → 12 May → 12 Jun. A month once started is charged in full, so clearing on
// 12 May is one month and on 13 May two, and there is always at least one.
//
// Each month is charged on what was owed at its start plus any more money taken during it: more
// taken on 20 Apr is charged from 12 Apr. Principal repaid during a month lowers what is owed
// from the next month on.
//
// Penalty: a month's interest falls due at that month's end. Interest left unpaid for longer than
// PENALTY_GRACE_MONTHS after that earns penalty at the loan's own monthly rate, simple, for every
// further month. Interest paid (or let go as discount) clears the oldest interest first, and from
// the month after the payment, as principal does. Penalty is charged only for loan months that
// start on or after PENALTY_FROM, so loans already running when the books opened are not charged
// for months before the shop had the rule.
export const PENALTY_GRACE_MONTHS = 12;
export const PENALTY_FROM = "2026-11-02";

const parts = (day: string) => day.split("-").map(Number) as [number, number, number];
const pad = (n: number) => String(n).padStart(2, "0");

// The day n months after `day`, always counted from the loan's own day: a loan of 31 Jan runs to
// 28 (or 29) Feb, then back to 31 Mar, 30 Apr, 31 May, never drifting down to the 28th.
export function addMonths(day: string, n: number) {
  const [y, m, d] = parts(day);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

// Which month of the loan a day falls in, from 0. A month's end day starts the next month.
function monthOf(start: string, day: string) {
  if (day <= start) return 0;
  const [sy, sm] = parts(start);
  const [y, m] = parts(day);
  let k = (y - sy) * 12 + (m - sm);
  if (addMonths(start, k) > day) k -= 1;
  return Math.max(0, k);
}

// How many months are charged for a loan given on `start` and settled on `until`.
export function monthsBetween(start: string, until: string) {
  const k = monthOf(start, until);
  return Math.max(1, addMonths(start, k) === until ? k : k + 1);
}

export function accruedInterest(
  loan: { date: string | null; interest: number | null },
  firstAmt: number,
  events: { date: string | null; amt: number | null; type: string | null }[],
  until = new Date(),
) {
  if (!loan.date) return { interest: 0, months: 0, penalty: 0 };
  const start = istDate(parseDbDate(loan.date));
  const inMonths = (types: string[]) => events
    .filter((event) => event.date && types.includes(event.type ?? ""))
    .map((event) => ({ month: monthOf(start, istDate(parseDbDate(event.date!))), amt: event.amt ?? 0, type: event.type }));
  const moves = inMonths(["topup", "principal"]);
  const credits = inMonths(["interest", "discount"]);

  // More money taken in a later month than the loan is settled in is still charged for that month.
  const lastTopup = Math.max(-1, ...moves.filter((move) => move.type === "topup").map((move) => move.month));
  const months = Math.max(monthsBetween(start, istDate(until)), lastTopup + 1);
  const rate = (loan.interest ?? 0) / 100;

  let owed = firstAmt;
  let interest = 0;
  let penalty = 0;
  const charged: number[] = [];
  for (let k = 0; k < months; k++) {
    const inMonth = (type: string) => moves.filter((move) => move.month === k && move.type === type).reduce((sum, move) => sum + move.amt, 0);
    owed += inMonth("topup");
    const thisMonth = Math.max(0, owed) * rate;
    interest += thisMonth;
    charged.push(thisMonth);
    owed -= inMonth("principal");

    // Months 0 … k-1-grace have been due for longer than the grace period when month k starts.
    const lastOverdue = k - 1 - PENALTY_GRACE_MONTHS;
    if (lastOverdue >= 0 && addMonths(start, k) >= PENALTY_FROM) {
      const due = charged.slice(0, lastOverdue + 1).reduce((sum, amt) => sum + amt, 0);
      const paid = credits.filter((credit) => credit.month < k).reduce((sum, credit) => sum + credit.amt, 0);
      penalty += Math.max(0, due - paid) * rate;
    }
  }
  return { interest: round2(interest), months, penalty: round2(penalty) };
}

// Where a loan stands on a day, from its rows: what was first given, what is owed, and interest.
// gold_loan.amt is all that was given on the pledge, the first amount and any more taken since.
export function loanFigures(
  loan: { date: string | null; amt: number | null; amtPaid: number | null; interest: number | null },
  payments: { date: string | null; amt: number | null; type: string | null }[],
  until: Date,
) {
  const sum = (type: string) => round2(payments.filter((p) => p.type === type).reduce((total, p) => total + (p.amt ?? 0), 0));
  const firstAmt = round2((loan.amt ?? 0) - sum("topup"));
  const { interest: accrued, months, penalty } = accruedInterest(loan, firstAmt, payments, until);
  return {
    firstAmt,
    accrued,
    months,
    discount: sum("discount"),
    principalDue: round2((loan.amt ?? 0) - (loan.amtPaid ?? 0)),
    interestDue: Math.max(0, round2(accrued - sum("interest") - sum("discount"))),
    // penalty is what the rule charges; at clearance it can be raised (penalty_extra) or lowered (penalty_waiver).
    penalty,
    penaltyExtra: sum("penalty_extra"),
    penaltyWaived: sum("penalty_waiver"),
    penaltyDue: Math.max(0, round2(penalty + sum("penalty_extra") - sum("penalty") - sum("penalty_waiver"))),
  };
}

// For a loan with no penalty yet: the shop day its penalty starts if nothing more is paid, or null
// when that is more than four years off (or never, for a loan kept up to date). A month's charge
// starts the day after the month's start day, as clearing on 12 May is one month and on 13 May two.
export function penaltyStartsOn(
  loan: { date: string | null; amt: number | null; amtPaid: number | null; interest: number | null },
  payments: { date: string | null; amt: number | null; type: string | null }[],
  from: Date,
) {
  if (!loan.date || !loan.interest) return null;
  const start = istDate(parseDbDate(loan.date));
  const { months } = loanFigures(loan, payments, from);
  for (let k = months; k < months + 48; k++) {
    const [y, m, d] = parts(addMonths(start, k));
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const day = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
    if (loanFigures(loan, payments, parseDbDate(day)).penalty > 0) return day;
  }
  return null;
}
