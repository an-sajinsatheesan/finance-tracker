import { round2 } from '../utils/money.js';

export type LoanKind = 'disbursement' | 'charge' | 'interest' | 'repayment' | 'prepayment' | 'rate' | 'adjustment';
export interface LoanLine { id: string; date: string; kind: LoanKind; amount: number; rate?: number | null; statementBalance?: number | null; order?: number }

/** How a line moves the amount outstanding (+ owes more, − owes less). */
export function effect(l: Pick<LoanLine, 'kind' | 'amount'>): number {
  switch (l.kind) {
    case 'disbursement': case 'charge': case 'interest': return Math.abs(l.amount);
    case 'repayment': case 'prepayment': return -Math.abs(l.amount);
    case 'adjustment': return l.amount;
    default: return 0;
  }
}

/** Lines in date order with the running balance, and whether it matches the statement's balance. */
export function ledger<T extends LoanLine>(lines: T[]) {
  const sorted = [...lines].sort((a, b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0));
  let balance = 0;
  let rate: number | null = null;
  return sorted.map((l) => {
    balance = round2(balance + effect(l));
    if (l.kind === 'rate' && l.rate) rate = l.rate;
    const matches = l.statementBalance == null || l.kind === 'rate' ? null : Math.abs(l.statementBalance - balance) < 0.5;
    return { ...l, balance, rate: l.kind === 'rate' ? l.rate ?? null : rate, matches };
  });
}

/** Totals for the summary cards: outstanding, borrowed, interest, repaid and the current rate. */
export function summary(rows: ReturnType<typeof ledger>, today: string) {
  const sum = (pick: (r: (typeof rows)[number]) => boolean) => round2(rows.filter(pick).reduce((s, r) => s + Math.abs(r.amount), 0));
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const last = rows[rows.length - 1];
  const repayments = rows.filter((r) => r.kind === 'repayment');
  const interest = sum((r) => r.kind === 'interest');
  const repaid = sum((r) => r.kind === 'repayment' || r.kind === 'prepayment');
  return {
    outstanding: last?.balance ?? 0,
    borrowed: sum((r) => r.kind === 'disbursement'),
    charges: sum((r) => r.kind === 'charge'),
    interest,
    interestLastYear: sum((r) => r.kind === 'interest' && r.date > yearAgo),
    repaid,
    prepaid: sum((r) => r.kind === 'prepayment'),
    /** Repayments beyond the interest charged went to the principal. */
    principalRepaid: round2(Math.max(0, repaid - interest)),
    rate: last?.rate ?? null,
    lastPayment: repayments.length ? repayments[repayments.length - 1].amount : null,
    lastDate: last?.date ?? null,
    firstDate: rows[0]?.date ?? null,
    mismatches: rows.filter((r) => r.matches === false).length,
  };
}

/** Outstanding at the end of each month that has lines (YYYY-MM → balance). */
export function monthEnds(rows: ReturnType<typeof ledger>) {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.date.slice(0, 7), r.balance);
  return out;
}
