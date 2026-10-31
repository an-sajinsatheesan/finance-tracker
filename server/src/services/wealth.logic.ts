/**
 * Wealth calculations (pure, no DB).
 *
 * Rules
 * - A balance is recorded per account per month. A month without a record
 *   carries forward the latest earlier balance.
 * - Loans and credit cards (group "liability") hold a positive outstanding
 *   amount and are subtracted from net worth.
 * - Totals are kept per currency. The combined figure converts to the base
 *   currency with the workspace rates (units of currency per 1 base unit).
 */
import { round2, sum } from '../utils/money.js';
import { addMonths } from '../utils/month.js';
import { ACCOUNT_GROUPS, type AccountGroup } from '../utils/lookups.js';

export interface AccountRow {
  id: string; name: string; bank: string; currency: string; accountType: string; group: AccountGroup;
  type: 'personal' | 'common'; ownerId?: string | null; openedMonth: string;
}
/** `calculated`: not entered by the user, worked out from the linked income, expenses and transfers. */
export interface BalanceRow { accountId: string; month: string; balance: number; invested?: number | null; calculated?: boolean; opening?: boolean }
export interface TransferRow { month: string; date: string; fromAccountId: string; toAccountId: string; amount: number; toAmount: number; fee?: number }

type GroupTotals = Record<AccountGroup, number>;
const emptyGroups = (): GroupTotals => Object.fromEntries(ACCOUNT_GROUPS.map((g) => [g, 0])) as GroupTotals;

/** Latest balance recorded at or before `month` (null when none yet). */
export function balanceAt(balances: BalanceRow[], accountId: string, month: string): BalanceRow | null {
  let best: BalanceRow | null = null;
  for (const b of balances) {
    if (b.accountId !== accountId || b.month > month) continue;
    if (!best || b.month > best.month) best = b;
  }
  return best;
}

const signed = (a: AccountRow, v: number) => (a.group === 'liability' ? -v : v);

function totalsFor(accounts: AccountRow[], balances: BalanceRow[], month: string) {
  const byCurrency: Record<string, { net: number; assets: number; liabilities: number; groups: GroupTotals }> = {};
  for (const a of accounts) {
    if (a.openedMonth > month) continue;
    const v = balanceAt(balances, a.id, month)?.balance ?? 0;
    const t = (byCurrency[a.currency] ??= { net: 0, assets: 0, liabilities: 0, groups: emptyGroups() });
    t.groups[a.group] = round2(t.groups[a.group] + v);
    if (a.group === 'liability') t.liabilities = round2(t.liabilities + v);
    else t.assets = round2(t.assets + v);
    t.net = round2(t.net + signed(a, v));
  }
  return byCurrency;
}

export function toBase(amount: number, currency: string, base: string, fx: Record<string, number>): number | null {
  if (currency === base) return amount;
  const rate = fx[currency];
  return rate && rate > 0 ? round2(amount / rate) : null;
}

export function computeWealth(input: {
  accounts: AccountRow[]; balances: BalanceRow[]; transfers: TransferRow[];
  month: string; base: string; fx: Record<string, number>; trendMonths?: number;
}) {
  const { accounts, balances, transfers, month, base, fx } = input;
  const entered = balances.filter((b) => !b.calculated || b.opening); // an opening balance was entered, even though its month-end is calculated
  const prev = addMonths(month, -1);
  const missingRates = new Set<string>();
  const conv = (v: number, cur: string) => {
    const r = toBase(v, cur, base, fx);
    if (r === null) missingRates.add(cur);
    return r ?? 0;
  };

  const rows = accounts
    .filter((a) => a.openedMonth <= month)
    .map((a) => {
      const cur = balanceAt(balances, a.id, month);
      const before = balanceAt(balances, a.id, prev);
      const current = cur?.balance ?? null;
      const previous = a.openedMonth <= prev ? before?.balance ?? null : null;
      const invested = cur?.invested ?? null;
      return {
        ...a,
        current,
        previous,
        change: current !== null ? round2(current - (previous ?? 0)) : null,
        recordedThisMonth: cur?.month === month && !cur.calculated,
        lastRecordedMonth: balanceAt(entered, a.id, month)?.month ?? null,
        invested,
        gain: a.group === 'investment' && invested !== null && current !== null ? round2(current - invested) : null,
      };
    });

  const nowT = totalsFor(accounts, balances, month);
  const prevT = totalsFor(accounts, balances, prev);
  const currencies = [...new Set([...Object.keys(nowT), ...Object.keys(prevT)])].sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
  const byCurrency = currencies.map((c) => {
    const n = nowT[c] ?? { net: 0, assets: 0, liabilities: 0, groups: emptyGroups() };
    const p = prevT[c] ?? { net: 0, assets: 0, liabilities: 0, groups: emptyGroups() };
    const inv = rows.filter((r) => r.currency === c && r.group === 'investment');
    return {
      currency: c,
      assets: n.assets, liabilities: n.liabilities, net: n.net,
      previousNet: p.net, change: round2(n.net - p.net),
      groups: ACCOUNT_GROUPS.map((g) => ({ group: g, current: n.groups[g], previous: p.groups[g], change: round2(n.groups[g] - p.groups[g]) })),
      investments: {
        value: sum(inv.map((r) => r.current ?? 0)),
        invested: sum(inv.map((r) => r.invested ?? r.current ?? 0)),
        gain: sum(inv.map((r) => r.gain ?? 0)),
      },
      netInBase: conv(n.net, c),
    };
  });

  const combined = {
    currency: base,
    assets: sum(byCurrency.map((c) => conv(c.assets, c.currency))),
    liabilities: sum(byCurrency.map((c) => conv(c.liabilities, c.currency))),
    net: sum(byCurrency.map((c) => conv(c.net, c.currency))),
    previousNet: sum(byCurrency.map((c) => conv(c.previousNet, c.currency))),
    change: 0,
  };
  combined.change = round2(combined.net - combined.previousNet);

  const n = input.trendMonths ?? 12;
  const trendMonths = Array.from({ length: n }, (_, i) => addMonths(month, i - n + 1));
  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));
  const trend = trendMonths.map((m) => {
    const t = totalsFor(accounts, balances, m);
    const tr = transfers.filter((x) => x.month === m);
    return {
      month: m,
      net: sum(Object.entries(t).map(([c, v]) => conv(v.net, c))),
      byCurrency: Object.fromEntries(Object.entries(t).map(([c, v]) => [c, v.net])),
      transferredOut: sum(tr.filter((x) => accountCurrency.get(x.fromAccountId) !== accountCurrency.get(x.toAccountId)).map((x) => conv(x.amount, accountCurrency.get(x.fromAccountId) ?? base))),
    };
  });

  // Transfers this month grouped by currency pair (e.g. AED → INR), with the effective rate.
  const pairs = new Map<string, { from: string; to: string; amount: number; toAmount: number; fee: number; count: number }>();
  for (const t of transfers.filter((x) => x.month === month)) {
    const from = accountCurrency.get(t.fromAccountId) ?? '?';
    const to = accountCurrency.get(t.toAccountId) ?? '?';
    const k = `${from}>${to}`;
    const p = pairs.get(k) ?? { from, to, amount: 0, toAmount: 0, fee: 0, count: 0 };
    p.amount = round2(p.amount + t.amount);
    p.toAmount = round2(p.toAmount + t.toAmount);
    p.fee = round2(p.fee + (t.fee ?? 0));
    p.count += 1;
    pairs.set(k, p);
  }
  const transferSummary = [...pairs.values()].map((p) => ({ ...p, rate: p.amount > 0 ? Math.round((p.toAmount / p.amount) * 10000) / 10000 : null }));

  return {
    month, base, fx,
    accounts: rows,
    byCurrency,
    combined,
    trend,
    transferSummary,
    missingRates: [...missingRates],
    staleAccounts: rows.filter((r) => !r.recordedThisMonth).map((r) => r.id),
  };
}
