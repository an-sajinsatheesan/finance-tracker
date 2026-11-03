import { describe, expect, it } from 'vitest';
import { effect, ledger, monthEnds, summary } from './loan.logic.js';

const lines = [
  { id: '1', date: '2022-09-19', kind: 'disbursement' as const, amount: 896000, statementBalance: 896000 },
  { id: '2', date: '2022-09-19', kind: 'rate' as const, amount: 0, rate: 9.15, order: 1 },
  { id: '3', date: '2022-09-20', kind: 'charge' as const, amount: 3000, statementBalance: 899000 },
  { id: '4', date: '2022-09-30', kind: 'interest' as const, amount: 2452, statementBalance: 901452 },
  { id: '5', date: '2022-10-02', kind: 'repayment' as const, amount: 2452, statementBalance: 899000 },
  { id: '6', date: '2022-10-05', kind: 'prepayment' as const, amount: 100000, statementBalance: 790000 },
];

describe('loan ledger', () => {
  it('adds disbursements, charges and interest, and takes off repayments', () => {
    expect(effect({ kind: 'interest', amount: 10 })).toBe(10);
    expect(effect({ kind: 'repayment', amount: 10 })).toBe(-10);
    expect(effect({ kind: 'rate', amount: 0 })).toBe(0);
    expect(effect({ kind: 'adjustment', amount: -5 })).toBe(-5);
  });

  it('runs the balance and checks it against the statement', () => {
    const rows = ledger(lines);
    expect(rows.map((r) => r.balance)).toEqual([896000, 896000, 899000, 901452, 899000, 799000]);
    expect(rows.map((r) => r.matches)).toEqual([true, null, true, true, true, false]);
    expect(rows[5].rate).toBe(9.15);
  });

  it('sums borrowed, interest and repaid, and the month-end balances', () => {
    const rows = ledger(lines);
    const s = summary(rows, '2022-12-31');
    expect(s).toMatchObject({ outstanding: 799000, borrowed: 896000, charges: 3000, interest: 2452, repaid: 102452, prepaid: 100000, principalRepaid: 100000, rate: 9.15, mismatches: 1 });
    expect(Object.fromEntries(monthEnds(rows))).toEqual({ '2022-09': 901452, '2022-10': 799000 });
  });
});
