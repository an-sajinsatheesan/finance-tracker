import { describe, expect, it } from 'vitest';
import { computeBalances, type BalancesInput } from './balances.logic.js';
import type { AccountRow } from './wealth.logic.js';

const acc = (id: string, over: Partial<AccountRow> = {}): AccountRow => ({
  id, name: id, bank: 'X', currency: 'AED', accountType: 'Savings', group: 'cash', type: 'personal', ownerId: 'u1', openedMonth: '2026-01', ...over,
});
const share = (userId: string, amount: number) => [{ userId, amount }];

const base: BalancesInput = {
  accounts: [
    acc('enbd'),
    acc('rak', { ownerId: 'u2' }),
    acc('joint', { type: 'common', ownerId: null }),
    acc('card', { group: 'liability', accountType: 'Credit card' }),
  ],
  snapshots: [{ accountId: 'enbd', month: '2026-09', balance: 5000 }],
  incomes: [
    { userId: 'u1', month: '2026-10', receivedDate: '2026-10-01', receivedAmount: 7000, status: 'received', accountId: 'enbd' },
    { userId: 'u2', month: '2026-10', receivedDate: '2026-10-01', receivedAmount: 6000, status: 'received', accountId: 'rak' },
    // November's salary credited on 30 Oct: in the bank in October, counted as November income for savings.
    { userId: 'u1', month: '2026-11', receivedDate: '2026-10-30', receivedAmount: 7000, status: 'received', accountId: 'enbd' },
  ],
  expenses: [
    { month: '2026-10', amount: 1000, accountId: 'enbd', shares: share('u1', 1000) },
    { month: '2026-10', amount: 3000, accountId: 'joint', shares: [{ userId: 'u1', amount: 1500 }, { userId: 'u2', amount: 1500 }] },
    { month: '2026-10', amount: 400, accountId: 'card', shares: share('u1', 400) },
    { month: '2026-10', amount: 200, accountId: null, shares: share('u2', 200) },
  ],
  transfers: [{ month: '2026-10', fromAccountId: 'enbd', toAccountId: 'joint', amount: 4000, toAmount: 4000, fee: 0 }],
  memberIds: ['u1', 'u2'],
  month: '2026-10',
  startMonth: '2026-09',
  base: 'AED',
  fx: {},
  months: 3,
};

describe('calculated balances', () => {
  const b = computeBalances(base);
  const row = (id: string) => b.accounts.find((a) => a.id === id)!;

  it('starts from the last recorded balance and adds linked money (5k + 7k salary = 12k)', () => {
    const only = computeBalances({ ...base, expenses: [], transfers: [], incomes: base.incomes.slice(0, 1) });
    expect(only.accounts.find((a) => a.id === 'enbd')).toMatchObject({ opening: 5000, moneyIn: 7000, moneyOut: 0, closing: 12000, recorded: false });
  });

  it('adds money linked in the opening month to the balance entered with the account (5,127 + 13,000 on 30 Oct)', () => {
    const input: BalancesInput = {
      ...base, expenses: [], transfers: [],
      accounts: [acc('enbd', { openedMonth: '2026-10' })],
      snapshots: [{ accountId: 'enbd', month: '2026-10', balance: 5127, opening: true }],
      incomes: [{ userId: 'u1', month: '2026-11', receivedDate: '2026-10-30', receivedAmount: 13000, status: 'received', accountId: 'enbd' }],
    };
    expect(computeBalances(input).accounts[0]).toMatchObject({ opening: 5127, moneyIn: 13000, closing: 18127, recorded: false, untracked: null });
    expect(computeBalances({ ...input, month: '2026-11' }).accounts[0]).toMatchObject({ opening: 18127, moneyIn: 0, closing: 18127 });
  });

  it('subtracts expenses and transfers, and counts income on the day it reached the bank', () => {
    // 5000 + 7000 (Oct salary) + 7000 (Nov salary on 30 Oct) − 1000 expense − 4000 to joint
    expect(row('enbd')).toMatchObject({ moneyIn: 14000, moneyOut: 5000, closing: 14000 });
    expect(row('joint')).toMatchObject({ opening: 0, moneyIn: 4000, moneyOut: 3000, closing: 1000 });
  });

  it('takes next month’s bill paid early out on the day it was paid', () => {
    const early = { month: '2026-11', date: '2026-10-31', amount: 2500, accountId: 'enbd', shares: share('u1', 2500) };
    const r = computeBalances({ ...base, expenses: [...base.expenses, early] });
    expect(r.accounts.find((a) => a.id === 'enbd')).toMatchObject({ moneyOut: 7500, closing: 11500 });
    expect(computeBalances({ ...base, expenses: [...base.expenses, early], month: '2026-11' }).accounts.find((a) => a.id === 'enbd'))
      .toMatchObject({ moneyOut: 0, closing: 11500 });
    // Still November's spending in the savings table, not October's.
    expect(r.savings.find((s) => s.month === '2026-10')!.members.find((m) => m.userId === 'u1')!.spent).toBe(1000 + 1500 + 400);
  });

  it('raises a credit card balance when it pays for something', () => {
    expect(row('card').closing).toBe(400);
  });

  it('totals per person, joint and household (cards subtracted)', () => {
    expect(b.totals.members).toEqual({ u1: 14000 - 400, u2: 6000 });
    expect(b.totals.joint).toBe(1000);
    expect(b.totals.household).toBe(14000 - 400 + 6000 + 1000);
  });

  it('keeps each currency’s totals apart, in that currency', () => {
    const r = computeBalances({
      ...base,
      accounts: [...base.accounts, acc('sbi', { currency: 'INR' })],
      snapshots: [...base.snapshots, { accountId: 'sbi', month: '2026-09', balance: 250000 }],
    });
    expect(r.byCurrency.map((c) => c.currency)).toEqual(['AED', 'INR']);
    expect(r.byCurrency[0].totals.household).toBe(14000 - 400 + 6000 + 1000);
    expect(r.byCurrency[1].totals).toEqual({ household: 250000, joint: 0, members: { u1: 250000, u2: 0 } });
  });

  it('shows the difference when a recorded balance does not match the linked money', () => {
    const r = computeBalances({ ...base, snapshots: [...base.snapshots, { accountId: 'rak', month: '2026-10', balance: 5500 }] });
    expect(r.accounts.find((a) => a.id === 'rak')).toMatchObject({ closing: 5500, recorded: true, untracked: -500 });
  });

  it('works out monthly savings per person from income and their share of spending', () => {
    const oct = b.savings.find((s) => s.month === '2026-10')!;
    expect(oct.members).toEqual([
      { userId: 'u1', income: 7000, spent: 1000 + 1500 + 400, saved: 4100 },
      { userId: 'u2', income: 6000, spent: 1500 + 200, saved: 4300 },
    ]);
    expect(oct.saved).toBe(8400);
    expect(b.savings.map((s) => s.month)).toEqual(['2026-09', '2026-10']); // not before the start month
  });

  it('flags money not linked to an account', () => {
    expect(b.unlinked.expenses).toEqual({ count: 1, amount: 200 });
  });
});
