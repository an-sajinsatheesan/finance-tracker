import { env } from '../config/env.js';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Current month (YYYY-MM) in the app timezone. */
export function currentMonth(now = new Date()): string {
  return today(now).slice(0, 7);
}

/** Today (YYYY-MM-DD) in the app timezone. */
export function today(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parts; // en-CA gives YYYY-MM-DD
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthRange(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endMonth, i - count + 1));
}

export function dateInMonth(month: string, day: number): string {
  const d = Math.min(Math.max(1, day), daysInMonth(month));
  return `${month}-${String(d).padStart(2, '0')}`;
}
