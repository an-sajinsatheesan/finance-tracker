import { describe, expect, it } from 'vitest';
import { balanceAt, computeWealth, toBase, type AccountRow, type BalanceRow } from './wealth.logic.js';
import { computeReminders, type ReminderCommitment } from './reminder.logic.js';

const acc = (id: string, currency: string, group: AccountRow['group'], openedMonth = '2026-01'): AccountRow => ({
  id, name: id, bank: 'X', currency, accountType: group, group, type: 'common', openedMonth,
});

describe('wealth', () => {
  const accounts = [
    acc('enbd', 'AED', 'cash'),
    acc('sbi', 'INR', 'cash'),
    acc('sip', 'INR', 'investment'),
    acc('loan', 'INR', 'liability'),
    acc('fd', 'AED', 'deposit', '2026-10'),
  ];
  const balances: BalanceRow[] = [
    { accountId: 'enbd', month: '2026-08', balance: 10000 },
    { accountId: 'enbd', month: '2026-10', balance: 12000 },
    { accountId: 'sbi', month: '2026-09', balance: 235000 },
    { accountId: 'sip', month: '2026-10', balance: 120000, invested: 100000 },
    { accountId: 'loan', month: '2026-09', balance: 470000 },
    { accountId: 'loan', month: '2026-10', balance: 460000 },
    { accountId: 'fd', month: '2026-10', balance: 5000 },
  ];
  const transfers = [
    { month: '2026-10', date: '2026-10-02', fromAccountId: 'enbd', toAccountId: 'sbi', amount: 2000, toAmount: 47000 },
    { month: '2026-10', date: '2026-10-20', fromAccountId: 'enbd', toAccountId: 'sbi', amount: 1000, toAmount: 23600, fee: 10 },
  ];
  const w = computeWealth({ accounts, balances, transfers, month: '2026-10', base: 'AED', fx: { INR: 23.5 }, trendMonths: 3 });

  it('carries the latest balance forward', () => {
    expect(balanceAt(balances, 'enbd', '2026-09')?.balance).toBe(10000);
    expect(balanceAt(balances, 'sbi', '2026-11')?.balance).toBe(235000);
    expect(balanceAt(balances, 'sbi', '2026-08')).toBeNull();
  });

  it('shows previous and current balance per account', () => {
    const enbd = w.accounts.find((a) => a.id === 'enbd')!;
    expect(enbd).toMatchObject({ previous: 10000, current: 12000, change: 2000, recordedThisMonth: true });
    const sbi = w.accounts.find((a) => a.id === 'sbi')!;
    expect(sbi).toMatchObject({ previous: 235000, current: 235000, recordedThisMonth: false });
    expect(w.accounts.find((a) => a.id === 'fd')!.previous).toBeNull(); // opened this month
    expect(w.accounts.find((a) => a.id === 'sip')!.gain).toBe(20000);
  });

  it('totals per currency with liabilities subtracted', () => {
    const inr = w.byCurrency.find((c) => c.currency === 'INR')!;
    expect(inr.assets).toBe(355000);
    expect(inr.liabilities).toBe(460000);
    expect(inr.net).toBe(-105000);
    expect(inr.previousNet).toBe(235000 - 470000);
    const aed = w.byCurrency.find((c) => c.currency === 'AED')!;
    expect(aed.net).toBe(17000);
    expect(aed.groups.find((g) => g.group === 'deposit')).toMatchObject({ current: 5000, previous: 0 });
    expect(w.byCurrency[0].currency).toBe('AED'); // base first
  });

  it('combines currencies into the base currency', () => {
    expect(toBase(23500, 'INR', 'AED', { INR: 23.5 })).toBe(1000);
    expect(toBase(1, 'USD', 'AED', {})).toBeNull();
    expect(w.combined.net).toBeCloseTo(17000 + -105000 / 23.5, 1);
    expect(w.missingRates).toEqual([]);
    expect(w.trend.map((t) => t.month)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('summarises transfers by currency pair', () => {
    expect(w.transferSummary).toEqual([{ from: 'AED', to: 'INR', amount: 3000, toAmount: 70600, fee: 10, count: 2, rate: 23.5333 }]);
    expect(w.trend[2].transferredOut).toBe(3000);
  });
});

describe('reminders', () => {
  const S = 's', A = 'a';
  const c = (id: string, dueDay: number, extra: Partial<ReminderCommitment> = {}): ReminderCommitment => ({
    id, title: id, type: 'common', category: 'Rent', startMonth: '2026-01', dueDay, reminderDaysBefore: 3,
    amountHistory: [{ fromMonth: '2026-01', amount: 1000 }], ...extra,
  });

  it('lists overdue and due-soon unpaid bills', () => {
    const list = computeReminders(
      [c('late', 5), c('today', 20), c('soon', 23), c('later', 28), c('paid', 21), c('off', 21, { reminderDaysBefore: null })],
      new Set(['paid:2026-10']), '2026-10-20', S, [S, A],
    );
    expect(list.map((r) => [r.id, r.status])).toEqual([['late', 'overdue'], ['today', 'due-today'], ['soon', 'due-soon']]);
    expect(list[0].myShare).toBe(500);
  });

  it('reaches into next month and skips other people’s personal bills', () => {
    const list = computeReminders(
      [c('rent', 1), c('hers', 30, { type: 'personal', ownerId: A })],
      new Set(['rent:2026-10']), '2026-10-30', S, [S, A],
    );
    expect(list.map((r) => [r.id, r.month])).toEqual([['rent', '2026-11']]);
  });
});
