/**
 * Pure financial calculations. All rules live here so they can be unit tested.
 *
 * Rules
 * - Personal expenses belong to one user (their single share).
 * - Common expenses are split equally (or by their commitment's split); each user's
 *   cost is their share, so the household total equals the sum of amounts (never double-counted).
 * - Paying a partner's personal commitment is support: the cost is the payer's.
 * - Planned commitments are separate from actual expenses.
 * - Expected income is separate from received income.
 * - Cash left = received income − actual outflow (my costs).
 */
import { round2, sum } from '../utils/money.js';
import { categoryLabel } from '../utils/categories.js';
import { daysInMonth } from '../utils/month.js';
import { amountFor, isActiveIn, paymentStatus, splitByWeights, splitWeights, type CommitmentLike, type SplitLike } from './commitment.logic.js';

export interface IncomeRow { userId: string; month: string; expectedAmount: number; receivedAmount: number; status: string }
export interface ExpenseRow {
  id: string; month: string; date: string; amount: number; type: 'personal' | 'common'; category: string;
  customCategory?: string; paidBy: string; ownerId?: string | null; shares: { userId: string; amount: number }[];
  commitmentId?: string | null;
  settlesCommitment?: boolean | null;
}
export interface CommitmentRow extends CommitmentLike {
  id: string; title: string; type: 'personal' | 'common'; ownerId?: string | null; category: string; customCategory?: string; dueDay?: number;
  split?: SplitLike | null;
}
export interface AllocationRow { userId: string; month: string; amount: number }

export interface Dataset {
  memberIds: string[];
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
  commitments: CommitmentRow[];
  allocations: AllocationRow[];
}

/** 'common' = household view; otherwise a member's userId. */
export type Scope = 'common' | string;

const shareOf = (e: ExpenseRow, userId: string) => sum(e.shares.filter((s) => s.userId === userId).map((s) => s.amount));

/** Each member's expected income in a month (for commitments split by salary). */
export function incomeIn(incomes: IncomeRow[], month: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of incomes) if (i.month === month && i.status !== 'archived') out[i.userId] = (out[i.userId] ?? 0) + i.expectedAmount;
  return out;
}

/** Planned cost of a commitment for the scope in a month (common: by its split, 50/50 by default). */
export function plannedFor(c: CommitmentRow, month: string, scope: Scope, memberIds: string[], income: Record<string, number> = {}): number {
  if (!isActiveIn(c, month)) return 0;
  const amount = amountFor(c, month);
  if (scope === 'common') return amount;
  if (c.type === 'personal') return c.ownerId === scope ? amount : 0;
  const idx = memberIds.indexOf(scope);
  return idx < 0 ? 0 : splitByWeights(amount, splitWeights(c.split, memberIds, income))[idx];
}

/** Actual cost of an expense for the scope (household: full amount). */
export function costFor(e: ExpenseRow, scope: Scope): number {
  return scope === 'common' ? e.amount : shareOf(e, scope);
}

export function computeCards(d: Dataset, month: string, scope: Scope) {
  const inc = d.incomes.filter((i) => i.month === month && i.status !== 'archived' && (scope === 'common' || i.userId === scope));
  const exp = d.expenses.filter((e) => e.month === month);
  const alloc = d.allocations.filter((a) => a.month === month && (scope === 'common' || a.userId === scope));

  const incomeExpected = sum(inc.map((i) => i.expectedAmount));
  const incomeReceived = sum(inc.map((i) => i.receivedAmount));
  // Includes the partner's bills this person supported (paid for them).
  const personal = exp.filter((e) => e.type === 'personal' && (scope === 'common' || costFor(e, scope) > 0));
  const common = exp.filter((e) => e.type === 'common');
  const personalExpenses = sum(personal.map((e) => costFor(e, scope)));
  const commonTotal = sum(common.map((e) => e.amount));
  const commonShare = scope === 'common' ? commonTotal : sum(common.map((e) => shareOf(e, scope)));
  const totalOutflow = round2(personalExpenses + commonShare);
  const cashLeft = round2(incomeReceived - totalOutflow);
  const allocatedToGoals = sum(alloc.map((a) => a.amount));
  const income = incomeIn(d.incomes, month);
  const plannedCommitments = sum(d.commitments.map((c) => plannedFor(c, month, scope, d.memberIds, income)));

  // Who paid vs who bears the cost of common expenses (settle-up between partners).
  const members = d.memberIds.map((userId) => {
    const paid = sum(common.filter((e) => e.paidBy === userId).map((e) => e.amount));
    const share = sum(common.map((e) => shareOf(e, userId)));
    return { userId, commonPaid: paid, commonShare: share, balance: round2(paid - share) };
  });

  // Partners paying each other's personal bills (support, not owed back).
  const support = new Map<string, { from: string; to: string; amount: number }>();
  for (const e of exp.filter((x) => x.type === 'personal' && x.ownerId && x.shares.some((s) => s.userId !== x.ownerId))) {
    const key = `${e.paidBy}>${e.ownerId}`;
    const row = support.get(key) ?? { from: e.paidBy, to: e.ownerId!, amount: 0 };
    row.amount = round2(row.amount + e.amount);
    support.set(key, row);
  }

  return {
    incomeExpected,
    incomeReceived,
    // Income marked received counts as complete even when smaller than expected (e.g. a salary cut).
    incomePending: sum(inc.filter((i) => i.status !== 'received').map((i) => Math.max(0, i.expectedAmount - i.receivedAmount))),
    personalExpenses,
    commonShare,
    commonTotal,
    totalOutflow,
    cashLeft,
    allocatedToGoals,
    notYetAllocated: round2(cashLeft - allocatedToGoals),
    plannedCommitments,
    plannedBalance: round2(incomeExpected - plannedCommitments),
    members,
    support: [...support.values()],
  };
}

export function computeBudgetVsActual(d: Dataset, month: string, scope: Scope) {
  const map = new Map<string, { category: string; planned: number; actual: number }>();
  const row = (label: string) => {
    if (!map.has(label)) map.set(label, { category: label, planned: 0, actual: 0 });
    return map.get(label)!;
  };
  const relevantCommitment = (c: CommitmentRow) => (scope === 'common' ? c.type === 'common' : true);
  const relevantExpense = (e: ExpenseRow) => (scope === 'common' ? e.type === 'common' : true);
  const income = incomeIn(d.incomes, month);
  for (const c of d.commitments.filter(relevantCommitment)) {
    const p = plannedFor(c, month, scope, d.memberIds, income);
    if (p > 0) row(categoryLabel(c.category, c.customCategory)).planned += p;
  }
  for (const e of d.expenses.filter((x) => x.month === month && relevantExpense(x))) {
    const a = costFor(e, scope);
    if (a > 0) row(categoryLabel(e.category, e.customCategory)).actual += a;
  }
  return [...map.values()]
    .map((r) => ({ ...r, planned: round2(r.planned), actual: round2(r.actual) }))
    .sort((a, b) => b.planned + b.actual - (a.planned + a.actual));
}

export function computeDaily(d: Dataset, month: string, scope: Scope) {
  const days = daysInMonth(month);
  const out = Array.from({ length: days }, (_, i) => ({ day: i + 1, personal: 0, common: 0 }));
  for (const e of d.expenses.filter((x) => x.month === month)) {
    const cost = scope === 'common' ? (e.type === 'common' ? e.amount : 0) : costFor(e, scope);
    if (!cost) continue;
    const day = Number(e.date.slice(8, 10));
    const slot = out[day - 1];
    if (!slot) continue;
    if (e.type === 'common') slot.common = round2(slot.common + cost);
    else slot.personal = round2(slot.personal + cost);
  }
  return out;
}

export function computeTrend(d: Dataset, months: string[], scope: Scope) {
  return months.map((m) => {
    const c = computeCards(d, m, scope);
    return { month: m, incomeReceived: c.incomeReceived, outflow: c.totalOutflow, planned: c.plannedCommitments };
  });
}

/** Commitments due in the month for the scope, with paid/unpaid status. */
export function computeCommitmentsDue(d: Dataset, month: string, scope: Scope) {
  const income = incomeIn(d.incomes, month);
  return d.commitments
    .filter((c) => isActiveIn(c, month) && (scope === 'common' ? c.type === 'common' : c.type === 'common' || c.ownerId === scope))
    .map((c) => {
      const amount = amountFor(c, month);
      const payment = paymentStatus(amount, d.expenses.filter((e) => e.month === month && e.commitmentId === c.id));
      return {
        id: c.id, title: c.title, type: c.type, ownerId: c.ownerId ?? null, category: categoryLabel(c.category, c.customCategory), dueDay: c.dueDay ?? 1,
        amount, myShare: plannedFor(c, month, scope, d.memberIds, income), paid: payment.paid, payment,
        split: c.split?.mode ?? 'equal',
        shares: c.type === 'common' ? d.memberIds.map((userId) => ({ userId, amount: plannedFor(c, month, userId, d.memberIds, income) })) : undefined,
      };
    })
    .sort((a, b) => Number(a.paid) - Number(b.paid) || a.dueDay - b.dueDay);
}
