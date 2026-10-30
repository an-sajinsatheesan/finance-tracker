import { describe, expect, it } from 'vitest';
import { computeBudgetVsActual, computeCards, computeCommitmentsDue, type Dataset } from './summary.logic.js';
import { amountFor, isActiveIn, statusAt } from './commitment.logic.js';
import { buildShares } from './expense.logic.js';
import { splitEqually } from '../utils/money.js';

const S = 'sajin', A = 'abhi';
const base = (): Dataset => ({
  memberIds: [S, A],
  incomes: [
    { userId: S, month: '2026-10', expectedAmount: 11500, receivedAmount: 11500, status: 'received' },
    { userId: A, month: '2026-10', expectedAmount: 9000, receivedAmount: 0, status: 'expected' },
  ],
  expenses: [
    { id: 'e1', month: '2026-10', date: '2026-10-01', amount: 5500, type: 'common', category: 'Rent', paidBy: S, shares: buildShares('common', 5500, [S, A]), commitmentId: 'c1' },
    { id: 'e2', month: '2026-10', date: '2026-10-03', amount: 200.01, type: 'common', category: 'Grocery', paidBy: A, shares: buildShares('common', 200.01, [S, A]) },
    { id: 'e3', month: '2026-10', date: '2026-10-04', amount: 300, type: 'personal', category: 'Travel', paidBy: S, ownerId: S, shares: buildShares('personal', 300, [S, A], S) },
    { id: 'e4', month: '2026-09', date: '2026-09-04', amount: 999, type: 'personal', category: 'Travel', paidBy: S, ownerId: S, shares: buildShares('personal', 999, [S, A], S) },
  ],
  commitments: [
    { id: 'c1', title: 'Rent', type: 'common', category: 'Rent', startMonth: '2026-10', amountHistory: [{ fromMonth: '2026-10', amount: 5500 }] },
    { id: 'c2', title: 'Loan', type: 'personal', ownerId: S, category: 'Home Loan', startMonth: '2026-01', endMonth: '2026-09', amountHistory: [{ fromMonth: '2026-01', amount: 2500 }] },
    { id: 'c3', title: 'Chitti', type: 'personal', ownerId: A, category: 'Chitti', startMonth: '2026-10', amountHistory: [{ fromMonth: '2026-10', amount: 1000 }] },
  ],
  allocations: [{ userId: S, month: '2026-10', amount: 1000 }],
});

describe('money', () => {
  it('splits equally without losing fils', () => {
    expect(splitEqually(200.01, 2)).toEqual([100.01, 100]);
    expect(splitEqually(100, 2)).toEqual([50, 50]);
  });
});

describe('commitments', () => {
  const c = { startMonth: '2026-01', endMonth: '2026-06', amountHistory: [{ fromMonth: '2026-01', amount: 100 }, { fromMonth: '2026-04', amount: 150 }] };
  it('keeps historical amounts', () => {
    expect(amountFor(c, '2026-03')).toBe(100);
    expect(amountFor(c, '2026-04')).toBe(150);
  });
  it('stops after the end month', () => {
    expect(isActiveIn(c, '2026-06')).toBe(true);
    expect(isActiveIn(c, '2026-07')).toBe(false);
    expect(isActiveIn(c, '2025-12')).toBe(false);
  });
  it('derives tab status', () => {
    expect(statusAt(c, '2026-05')).toBe('active');
    expect(statusAt(c, '2026-07')).toBe('ended');
    expect(statusAt(c, '2025-11')).toBe('scheduled');
  });
});

describe('summary cards', () => {
  it('computes a personal view', () => {
    const c = computeCards(base(), '2026-10', S);
    expect(c.incomeReceived).toBe(11500);
    expect(c.personalExpenses).toBe(300);
    expect(c.commonShare).toBe(2750 + 100.01);
    expect(c.totalOutflow).toBe(3150.01);
    expect(c.cashLeft).toBe(8349.99);
    expect(c.allocatedToGoals).toBe(1000);
    expect(c.notYetAllocated).toBe(7349.99);
    // planned: half of rent; the ended loan does not count in October
    expect(c.plannedCommitments).toBe(2750);
  });
  it('never double-counts common expenses in the household view', () => {
    const d = base();
    const h = computeCards(d, '2026-10', 'common');
    const s = computeCards(d, '2026-10', S);
    const a = computeCards(d, '2026-10', A);
    expect(h.commonTotal).toBe(5700.01);
    expect(s.commonShare + a.commonShare).toBeCloseTo(h.commonTotal, 2);
    expect(h.totalOutflow).toBe(6000.01);
    expect(h.incomeExpected).toBe(20500);
    expect(h.incomeReceived).toBe(11500);
  });
  it('tracks who owes whom for common expenses', () => {
    const c = computeCards(base(), '2026-10', S);
    const me = c.members.find((m) => m.userId === S)!;
    expect(me.commonPaid).toBe(5500);
    expect(me.balance).toBe(2649.99);
  });
  it('isolates months', () => {
    const c = computeCards(base(), '2026-09', S);
    expect(c.personalExpenses).toBe(999);
    expect(c.plannedCommitments).toBe(2500);
  });
});

describe('budget vs actual and dues', () => {
  it('groups planned vs actual by category', () => {
    const rows = computeBudgetVsActual(base(), '2026-10', A);
    expect(rows.find((r) => r.category === 'Rent')).toEqual({ category: 'Rent', planned: 2750, actual: 2750 });
    expect(rows.find((r) => r.category === 'Chitti')).toEqual({ category: 'Chitti', planned: 1000, actual: 0 });
  });
  it('marks commitments paid when a linked expense exists', () => {
    const due = computeCommitmentsDue(base(), '2026-10', A);
    expect(due.find((d) => d.id === 'c1')?.paid).toBe(true);
    expect(due.find((d) => d.id === 'c3')?.paid).toBe(false);
    expect(due.find((d) => d.id === 'c2')).toBeUndefined();
  });
});
