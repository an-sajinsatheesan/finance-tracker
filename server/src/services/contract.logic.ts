import { round2 } from '../utils/money.js';
import { addMonths } from '../utils/month.js';

/** A date `months` months after `date` (YYYY-MM-DD), keeping the day where the month allows. */
export function addMonthsToDate(date: string, months: number): string {
  const m = addMonths(date.slice(0, 7), months);
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const day = Math.min(Number(date.slice(8, 10)), last);
  return `${m}-${String(day).padStart(2, '0')}`;
}

/** The day before the contract's next period starts, e.g. 2026-09-28 + 12 months → 2027-09-27. */
export function contractEnd(startDate: string, months: number): string {
  const next = new Date(`${addMonthsToDate(startDate, months)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() - 1);
  return next.toISOString().slice(0, 10);
}

/**
 * Cheques spread evenly over the contract: 12 months in 6 cheques is one every 2 months.
 * Amounts are equal; the last one takes any rounding difference so they add up to the total.
 */
export function chequeSchedule(startDate: string, months: number, total: number, count: number) {
  const n = Math.max(1, Math.round(count));
  const step = months / n;
  const each = round2(total / n);
  return Array.from({ length: n }, (_, i) => ({
    date: addMonthsToDate(startDate, Math.round(i * step)),
    amount: i === n - 1 ? round2(total - each * (n - 1)) : each,
  }));
}

/** Monthly budget of a contract: 36,000 over 12 months is 3,000 a month. */
export const monthlyAmount = (total: number, months: number) => round2(total / months);
