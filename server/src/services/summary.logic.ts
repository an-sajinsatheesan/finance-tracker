/**
 * Pure financial calculations. All rules live here so they can be unit tested.
 *
 * Rules
 * - Personal expenses belong to one user (their single share).
 * - Common expenses are split equally (or by their commitment's split); each user's
 *   cost is their share, so the household total equals the sum of amounts (never double-counted).
 * - Paying a partner's personal commitment is support: the cost is the payer's.
 * - A share sent to the partner who pays a common bill counts as paid by the sender;
 *   a bill paid from a joint account counts as paid by whoever put money in for it.
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
  accountId?: string | null;
  settlesCommitment?: boolean | null;
}
export interface CommitmentRow extends CommitmentLike {
  id: string; title: string; type: 'personal' | 'common'; ownerId?: string | null; category: string; customCategory?: string; dueDay?: number;
  split?: SplitLike | null;
}
export interface AllocationRow { userId: string; month: string; amount: number }
/** A partner's share of a common commitment sent before the bill is paid (toUserId empty: into a joint account). */
export interface ContributionRow { id: string; commitmentId: string; month: string; date: string; fromUserId: string; toUserId?: string | null; toAccountId?: string | null; amount: number }

export interface Dataset {
  memberIds: string[];
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
  commitments: CommitmentRow[];
  allocations: AllocationRow[];
  contributions?: ContributionRow[];
  /** Joint (common) accounts: bills paid from them are paid by the money put in. */
  jointAccountIds?: string[];
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

/**
 * How much each person has paid towards common expenses in a month:
 * - paid from their own account (or no account): the payer;
 * - a share sent to the partner who pays: the sender (and less for the receiver);
 * - paid from a joint account: whoever put money in for that bill, the rest by share.
 */
export function commonPaidBy(d: Dataset, month: string, common: ExpenseRow[]): Map<string, number> {
  const paid = new Map(d.memberIds.map((id) => [id, 0]));
  const add = (id: string, v: number) => { if (paid.has(id)) paid.set(id, (paid.get(id) ?? 0) + v); };
  const joint = new Set(d.jointAccountIds ?? []);
  const sent = (d.contributions ?? []).filter((x) => x.month === month);
  const fromJoint = new Map<string, ExpenseRow[]>(); // by commitment ('' = not for a commitment)
  for (const e of common) {
    if (e.accountId && joint.has(e.accountId)) fromJoint.set(e.commitmentId ?? '', [...(fromJoint.get(e.commitmentId ?? '') ?? []), e]);
    else add(e.paidBy, e.amount);
  }
  for (const [cid, list] of fromJoint) {
    const total = list.reduce((a, e) => a + e.amount, 0);
    const into = cid ? sent.filter((x) => !x.toUserId && x.commitmentId === cid) : [];
    const put = into.reduce((a, x) => a + x.amount, 0);
    const used = put > 0 ? Math.min(1, total / put) : 0;
    for (const x of into) add(x.fromUserId, x.amount * used);
    const rest = total - put * used;
    if (rest > 0.004) for (const id of d.memberIds) add(id, (rest * list.reduce((a, e) => a + shareOf(e, id), 0)) / total);
  }
  for (const x of sent) if (x.toUserId) { add(x.fromUserId, x.amount); add(x.toUserId, -x.amount); }
  return new Map([...paid].map(([k, v]) => [k, round2(v)]));
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
  const paidBy = commonPaidBy(d, month, common);
  const members = d.memberIds.map((userId) => {
    const paid = paidBy.get(userId) ?? 0;
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
      const sent = (d.contributions ?? []).filter((x) => x.month === month && x.commitmentId === c.id)
        .map((x) => ({ id: x.id, fromUserId: x.fromUserId, toUserId: x.toUserId ?? null, toAccountId: x.toAccountId ?? null, amount: x.amount, date: x.date }));
      return {
        id: c.id, title: c.title, type: c.type, ownerId: c.ownerId ?? null, category: categoryLabel(c.category, c.customCategory), dueDay: c.dueDay ?? 1,
        amount, myShare: plannedFor(c, month, scope, d.memberIds, income), paid: payment.paid, payment: { ...payment, sent },
        split: c.split?.mode ?? 'equal',
        shares: c.type === 'common' ? d.memberIds.map((userId) => ({ userId, amount: plannedFor(c, month, userId, d.memberIds, income) })) : undefined,
      };
    })
    .sort((a, b) => Number(a.paid) - Number(b.paid) || a.dueDay - b.dueDay);
}
