import { round2, sum } from '../utils/money.js';
import { addMonths } from '../utils/month.js';
import { toBase, type AccountRow } from './wealth.logic.js';

/**
 * Calculated account balances. Each account starts from its latest recorded
 * month-end balance (or 0 when it has none) and then moves with the money
 * linked to it: income paid in and transfers in raise it, expenses paid from
 * it and transfers out (plus fees) lower it. Loans and credit cards hold an
 * outstanding amount, so the same flows move them the other way.
 */

/** `opening`: the balance entered with the account, i.e. its balance when tracking starts (before that month's money). */
export interface SnapshotRow { accountId: string; month: string; balance: number; opening?: boolean }
export interface FlowIncome {
  userId: string; month: string; receivedDate?: string | null; receivedAmount: number; status: string; accountId?: string | null;
}
export interface FlowExpense { month: string; amount: number; accountId?: string | null; shares: { userId: string; amount: number }[] }
export interface FlowTransfer { month: string; fromAccountId: string; toAccountId: string; amount: number; toAmount: number; fee?: number }

export interface BalancesInput {
  accounts: AccountRow[];
  snapshots: SnapshotRow[];
  incomes: FlowIncome[];
  expenses: FlowExpense[];
  transfers: FlowTransfer[];
  memberIds: string[];
  month: string;
  /** First month the savings table may show (the workspace start month). */
  startMonth: string;
  base: string;
  fx: Record<string, number>;
  months?: number;
}

/** The month money reached the bank: the received date when known (November's salary can land on 28 Oct). */
export const cashMonth = (i: FlowIncome) => (i.receivedDate ? i.receivedDate.slice(0, 7) : i.month);

type Flow = { in: number; out: number };
const key = (accountId: string, month: string) => `${accountId}|${month}`;

/** Money in / out per account per month. */
export function indexFlows(incomes: FlowIncome[], expenses: FlowExpense[], transfers: FlowTransfer[]) {
  const idx = new Map<string, Flow>();
  const add = (accountId: string, month: string, field: keyof Flow, v: number) => {
    const k = key(accountId, month);
    const f = idx.get(k) ?? { in: 0, out: 0 };
    f[field] = round2(f[field] + v);
    idx.set(k, f);
  };
  for (const i of incomes) {
    if (i.accountId && i.status !== 'archived' && i.receivedAmount > 0) add(i.accountId, cashMonth(i), 'in', i.receivedAmount);
  }
  for (const e of expenses) if (e.accountId) add(e.accountId, e.month, 'out', e.amount);
  for (const t of transfers) {
    add(t.fromAccountId, t.month, 'out', t.amount + (t.fee ?? 0));
    add(t.toAccountId, t.month, 'in', t.toAmount);
  }
  return idx;
}

const sign = (a: AccountRow) => (a.group === 'liability' ? -1 : 1);

/** Month-end balance of an account; `recorded` when that month has an entered balance. Null before it opened. */
export function balanceAt(a: AccountRow, month: string, snapshots: SnapshotRow[], flows: Map<string, Flow>) {
  if (month < a.openedMonth) return null;
  let last: SnapshotRow | undefined;
  for (const s of snapshots) {
    if (s.accountId === a.id && s.month <= month && (!last || s.month > last.month)) last = s;
  }
  if (last && last.month === month && !last.opening) return { balance: last.balance, recorded: true };
  let bal = last ? last.balance : 0;
  // An opening balance is the start of its month, so that month's linked money is added to it.
  const from = !last ? a.openedMonth : last.opening ? last.month : addMonths(last.month, 1);
  for (let m = from; m <= month; m = addMonths(m, 1)) {
    const f = flows.get(key(a.id, m));
    if (f) bal = round2(bal + sign(a) * (f.in - f.out));
  }
  return { balance: bal, recorded: false };
}

export function computeBalances(input: BalancesInput) {
  const { accounts, snapshots, incomes, expenses, transfers, memberIds, month, base, fx } = input;
  const flows = indexFlows(incomes, expenses, transfers);
  const missingRates = new Set<string>();
  const conv = (v: number, cur: string) => {
    const r = toBase(v, cur, base, fx);
    if (r === null) missingRates.add(cur);
    return r ?? 0;
  };
  const prev = addMonths(month, -1);

  const rows = accounts
    .filter((a) => a.openedMonth <= month)
    .map((a) => {
      const start = snapshots.find((s) => s.accountId === a.id && s.month === month && s.opening);
      const opening = start ? start.balance : balanceAt(a, prev, snapshots, flows)?.balance ?? 0;
      const closing = balanceAt(a, month, snapshots, flows)!;
      const f = flows.get(key(a.id, month)) ?? { in: 0, out: 0 };
      const calculated = round2(opening + sign(a) * (f.in - f.out));
      return {
        ...a,
        opening,
        moneyIn: f.in,
        moneyOut: f.out,
        closing: closing.balance,
        recorded: closing.recorded,
        /** Recorded balance minus what the linked money explains (spending or income not entered). */
        untracked: closing.recorded ? round2(closing.balance - calculated) : null,
      };
    });

  /** Net balance in the base currency of the accounts matching `pick` at the end of month `m`. */
  const total = (m: string, pick: (a: AccountRow) => boolean) =>
    sum(accounts.filter((a) => pick(a)).map((a) => {
      const b = balanceAt(a, m, snapshots, flows);
      return b ? sign(a) * conv(b.balance, a.currency) : 0;
    }));
  const totalsFor = (m: string) => ({
    household: total(m, () => true),
    joint: total(m, (a) => a.type === 'common'),
    members: Object.fromEntries(memberIds.map((id) => [id, total(m, (a) => a.type === 'personal' && a.ownerId === id)])),
  });

  const count = input.months ?? 12;
  const trendMonths = Array.from({ length: count }, (_, i) => addMonths(month, i - count + 1));
  const trend = trendMonths.map((m) => ({ month: m, ...totalsFor(m) }));

  // Savings per person: income received for the month minus what they bear of the month's spending.
  let cumulative = 0;
  const savings = trendMonths.filter((m) => m >= input.startMonth).map((m) => {
    const members = memberIds.map((userId) => {
      const income = sum(incomes.filter((i) => i.month === m && i.userId === userId && i.status !== 'archived').map((i) => i.receivedAmount));
      const spent = sum(expenses.filter((e) => e.month === m).flatMap((e) => e.shares.filter((s) => s.userId === userId).map((s) => s.amount)));
      return { userId, income, spent, saved: round2(income - spent) };
    });
    const saved = sum(members.map((x) => x.saved));
    cumulative = round2(cumulative + saved);
    return { month: m, members, income: sum(members.map((x) => x.income)), spent: sum(members.map((x) => x.spent)), saved, cumulative };
  });

  const monthExpenses = expenses.filter((e) => e.month === month);
  const monthIncome = incomes.filter((i) => i.month === month && i.status !== 'archived' && i.receivedAmount > 0);
  const unlinkedExpenses = monthExpenses.filter((e) => !e.accountId);
  const unlinkedIncome = monthIncome.filter((i) => !i.accountId);

  return {
    month,
    base,
    accounts: rows,
    totals: totalsFor(month),
    trend,
    savings,
    unlinked: {
      expenses: { count: unlinkedExpenses.length, amount: sum(unlinkedExpenses.map((e) => e.amount)) },
      income: { count: unlinkedIncome.length, amount: sum(unlinkedIncome.map((i) => i.receivedAmount)) },
    },
    missingRates: [...missingRates],
  };
}
