/** Loan maths for the statement's new-month row and the EMI calculator. */

const r2 = (n: number) => Math.round(n * 100) / 100;
const daysIn = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/**
 * A month's interest the way banks charge "part period interest": daily on the balance, which
 * drops on the EMI day. `outstanding` is the balance at the start of the month.
 */
export function monthInterest(outstanding: number, ratePct: number, month: string, emiDay: number, emi: number) {
  const days = daysIn(month);
  const day = Math.min(Math.max(1, emiDay), days);
  const daily = ratePct / 100 / 365;
  return Math.round(outstanding * daily * (day - 1) + Math.max(0, outstanding - emi) * daily * (days - day + 1));
}

export interface ScheduleRow { n: number; month: string; interest: number; principal: number; emi: number; outstanding: number }

const addMonth = (month: string, k: number) => {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + k;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
};

/** Month-by-month repayment until the loan is cleared (monthly interest at rate/12). */
export function schedule(principal: number, ratePct: number, emi: number, startMonth: string, maxMonths = 600): ScheduleRow[] {
  const i = ratePct / 1200;
  const rows: ScheduleRow[] = [];
  let p = principal;
  for (let n = 1; p > 0.5 && n <= maxMonths; n++) {
    const interest = r2(p * i);
    if (emi <= interest) break; // the EMI doesn't even cover the interest
    const pay = Math.min(emi, p + interest);
    p = r2(p + interest - pay);
    rows.push({ n, month: addMonth(startMonth, n - 1), interest, principal: r2(pay - interest), emi: r2(pay), outstanding: p });
  }
  return rows;
}

/** EMI that clears `principal` in `months` months. */
export function emiFor(principal: number, ratePct: number, months: number) {
  const i = ratePct / 1200;
  if (i === 0) return r2(principal / months);
  const f = (1 + i) ** months;
  return r2((principal * i * f) / (f - 1));
}
