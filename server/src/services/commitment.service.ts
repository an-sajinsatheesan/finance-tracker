import { badRequest, notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { addMonths, currentMonth, dateInMonth, today } from '../utils/month.js';
import { commitmentRepository } from '../repositories/commitment.repository.js';
import { expenseRepository } from '../repositories/expense.repository.js';
import { assertMember, incomeByMember, memberIds } from './workspace.service.js';
import { assertLookup } from './lookup.service.js';
import {
  amountFor, paymentStatus, splitByWeights, splitWeights, statusAt, type CommitmentStatus, type PaymentLike, type SplitLike,
} from './commitment.logic.js';
import { assertMonthStarted, createExpense } from './expense.service.js';
import { assertAccount } from './account.service.js';
import { Account, Contribution } from '../models/index.js';

type CreateInput = {
  title: string; category: string; customCategory: string; type: 'personal' | 'common';
  ownerId?: string | null; amount: number; startMonth: string; endMonth?: string | null; dueDay: number; notes: string;
  reminderDaysBefore?: number | null;
  split?: SplitLike;
};

type Split = { mode: 'equal' | 'custom' | 'income'; shares?: { userId: string; amount: number }[] };

/** Validates a common commitment's split; personal commitments have none. */
async function cleanSplit(workspaceId: string, type: string, split: Split | undefined | null) {
  if (type !== 'common' || !split || split.mode === 'equal') return undefined;
  if (split.mode === 'income') return { mode: 'income' as const };
  const ids = await memberIds(workspaceId);
  const shares = (split.shares ?? []).filter((x) => ids.includes(x.userId)).map((x) => ({ userId: x.userId, amount: round2(x.amount) }));
  if (!shares.some((x) => x.amount > 0)) throw badRequest('Enter how much each person pays');
  return { mode: 'custom' as const, shares };
}

const splitOf = (c: any): Split => ({
  mode: c.type === 'common' && c.split?.mode ? c.split.mode : 'equal',
  ...(c.split?.mode === 'custom' && { shares: (c.split.shares ?? []).map((x: any) => ({ userId: String(x.userId), amount: x.amount })) }),
});

/** Ensures the first version starts exactly at startMonth and versions are sorted. */
export function normalizeHistory(history: { fromMonth: string; amount: number }[], startMonth: string) {
  const sorted = [...history].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  const atOrBefore = sorted.filter((v) => v.fromMonth <= startMonth);
  const base = atOrBefore[atOrBefore.length - 1] ?? sorted[0];
  return [{ fromMonth: startMonth, amount: base.amount }, ...sorted.filter((v) => v.fromMonth > startMonth)];
}

const toPayment = (e: { amount: number; paidBy: unknown; settlesCommitment?: boolean | null }): PaymentLike =>
  ({ amount: e.amount, paidBy: String(e.paidBy), settlesCommitment: e.settlesCommitment });

/** Each member's planned part of a common commitment in a month (by its split). */
export function plannedShares(c: any, month: string, members: string[], income: Record<string, number>) {
  const parts = splitByWeights(amountFor(c, month), splitWeights(splitOf(c), members, income));
  return members.map((userId, i) => ({ userId, amount: parts[i] }));
}

const toSent = (x: any) => ({
  id: String(x._id), fromUserId: String(x.fromUserId), toUserId: x.toUserId ? String(x.toUserId) : null,
  toAccountId: x.toAccountId ? String(x.toAccountId) : null, amount: x.amount, date: x.date,
});

export function serializeCommitment(c: any, refMonth = currentMonth(), payments?: PaymentLike[], shares?: { userId: string; amount: number }[], sent: any[] = []) {
  return {
    id: String(c._id),
    title: c.title,
    category: c.category,
    customCategory: c.customCategory,
    type: c.type,
    ownerId: c.ownerId ? String(c.ownerId) : null,
    amount: amountFor(c, refMonth),
    amountHistory: c.amountHistory,
    startMonth: c.startMonth,
    endMonth: c.endMonth ?? null,
    dueDay: c.dueDay,
    // Commitments created before reminders existed have no value: they get the default.
    reminderDaysBefore: c.reminderDaysBefore === undefined ? 3 : c.reminderDaysBefore,
    notes: c.notes,
    status: statusAt(c, refMonth) as CommitmentStatus,
    split: splitOf(c),
    ...(shares && c.type === 'common' && { shares }),
    ...(payments && { payment: { ...paymentStatus(amountFor(c, refMonth), payments), sent: sent.map(toSent) } }),
  };
}

/** Commitments as of a month, each with what has been paid towards it in that month. */
export async function listCommitments(workspaceId: string, refMonth = currentMonth()) {
  const [list, expenses, members, income, contributions] = await Promise.all([
    commitmentRepository.list(workspaceId),
    expenseRepository.listActiveByMonth(workspaceId, refMonth),
    memberIds(workspaceId),
    incomeByMember(workspaceId, refMonth),
    Contribution.find({ workspaceId, month: refMonth, status: 'active' }).sort({ date: 1, createdAt: 1 }).lean(),
  ]);
  return list.map((c) => serializeCommitment(
    c, refMonth,
    expenses.filter((e) => String(e.commitmentId) === String(c._id)).map(toPayment),
    plannedShares(c, refMonth, members, income),
    contributions.filter((x) => String(x.commitmentId) === String(c._id)),
  ));
}

export async function createCommitment(workspaceId: string, userId: string, input: CreateInput) {
  if (input.type === 'personal') await assertMember(workspaceId, input.ownerId, 'ownerId');
  await assertLookup(workspaceId, 'category', input.category, 'category');
  const doc = await commitmentRepository.create({
    workspaceId,
    title: input.title,
    category: input.category,
    customCategory: input.category === 'Custom' ? input.customCategory : '',
    type: input.type,
    ownerId: input.type === 'personal' ? input.ownerId : undefined,
    amountHistory: [{ fromMonth: input.startMonth, amount: round2(input.amount) }],
    startMonth: input.startMonth,
    endMonth: input.endMonth ?? null,
    dueDay: input.dueDay,
    reminderDaysBefore: input.reminderDaysBefore === undefined ? 3 : input.reminderDaysBefore,
    split: await cleanSplit(workspaceId, input.type, input.split as Split),
    notes: input.notes,
    createdBy: userId,
  });
  return serializeCommitment(doc.toObject());
}

export async function updateCommitment(workspaceId: string, id: string, input: Record<string, any>) {
  const doc = await commitmentRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Commitment');
  const type = input.type ?? doc.type;
  const ownerId = input.ownerId !== undefined ? input.ownerId : doc.ownerId ? String(doc.ownerId) : null;
  if (type === 'personal') {
    if (!ownerId) throw badRequest('Personal commitments need an owner');
    await assertMember(workspaceId, ownerId, 'ownerId');
  }
  if (input.category !== undefined) await assertLookup(workspaceId, 'category', input.category, 'category');
  for (const k of ['title', 'category', 'customCategory', 'startMonth', 'dueDay', 'reminderDaysBefore', 'notes'] as const) {
    if (input[k] !== undefined) doc.set(k, input[k]);
  }
  if (input.endMonth !== undefined) doc.endMonth = input.endMonth;
  doc.type = type;
  doc.set('ownerId', type === 'personal' ? ownerId : undefined);
  if (doc.category !== 'Custom') doc.customCategory = '';
  if (type !== 'common') doc.set('split', undefined);
  else if (input.split !== undefined) doc.set('split', await cleanSplit(workspaceId, type, input.split));

  let history = doc.amountHistory.map((v) => ({ fromMonth: v.fromMonth, amount: v.amount }));
  if (input.amount !== undefined) {
    // A new amount applies from `amountEffectiveFrom` onwards; earlier months keep their amount.
    const from: string = input.amountEffectiveFrom && input.amountEffectiveFrom > doc.startMonth ? input.amountEffectiveFrom : doc.startMonth;
    history = history.filter((v) => v.fromMonth < from);
    history.push({ fromMonth: from, amount: round2(input.amount) });
  }
  doc.set('amountHistory', normalizeHistory(history, doc.startMonth));
  if (doc.endMonth && doc.endMonth < doc.startMonth) throw badRequest('End month must be after start month');
  await doc.save();
  return serializeCommitment(doc.toObject());
}

export async function endCommitment(workspaceId: string, id: string, endMonth: string) {
  const doc = await commitmentRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Commitment');
  if (endMonth < doc.startMonth) throw badRequest('End month must be on or after the start month');
  doc.endMonth = endMonth;
  await doc.save();
  return serializeCommitment(doc.toObject());
}

export async function reactivateCommitment(workspaceId: string, id: string) {
  const doc = await commitmentRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Commitment');
  doc.endMonth = null;
  doc.archived = false;
  await doc.save();
  return serializeCommitment(doc.toObject());
}

/**
 * Deletes a commitment that is no longer needed. It disappears from every
 * month's plan; payments already recorded stay as ordinary expenses (unlinked).
 * Use "end" instead to keep it in the plan of past months.
 */
export async function deleteCommitment(workspaceId: string, id: string) {
  const doc = await commitmentRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Commitment');
  const unlinked = await expenseRepository.unlinkCommitment(workspaceId, id);
  await Contribution.updateMany({ workspaceId, commitmentId: id }, { $set: { status: 'archived' } });
  await commitmentRepository.delete(workspaceId, id);
  return { id, deleted: true, unlinkedPayments: unlinked };
}

/** Archive (setup clean-up only): hides a commitment created by mistake. */
export async function archiveCommitment(workspaceId: string, id: string) {
  const doc = await commitmentRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Commitment');
  doc.archived = true;
  await doc.save();
  return { id, archived: true };
}

/** Records the actual payment of a planned commitment as an expense (linked to it). */
export async function payCommitment(
  workspaceId: string,
  userId: string,
  id: string,
  input: { month: string; date?: string; paidBy?: string; amount?: number; accountId?: string | null; settles?: boolean },
) {
  // Next month's bills can be paid early (e.g. rent on the 31st): dated today, counted in their own month.
  const early = input.month === addMonths(currentMonth(), 1);
  if (!early) assertMonthStarted(input.month);
  const c = await commitmentRepository.findById(workspaceId, id);
  if (!c) throw notFound('Commitment');
  const planned = amountFor(c, input.month);
  const before = paymentStatus(planned, (await expenseRepository.listForCommitment(workspaceId, id, input.month)).map(toPayment));
  if (before.paid) throw badRequest('This commitment is already recorded as paid for that month');
  const amount = round2(input.amount ?? before.remaining);
  if (amount <= 0) throw badRequest('Enter the amount');
  // Final unless it leaves part of the bill for the other person (or a later payment).
  const settles = input.settles ?? before.paidAmount + amount >= planned - 0.005;
  const dateStr = early
    ? today()
    : input.date && input.date.startsWith(input.month)
      ? input.date
      : today().startsWith(input.month) ? today() : dateInMonth(input.month, c.dueDay ?? 1);
  const paidBy = input.paidBy ?? (c.type === 'personal' ? String(c.ownerId) : userId);
  return createExpense(workspaceId, userId, {
    date: dateStr,
    description: c.title,
    category: c.category,
    customCategory: c.customCategory,
    amount,
    paidBy,
    type: c.type,
    ownerId: c.type === 'personal' ? String(c.ownerId) : null,
    notes: '',
    commitmentId: id,
    accountId: input.accountId,
    month: input.month,
    settlesCommitment: settles,
  });
}

/**
 * Sends a partner's share of a common commitment to whoever pays the bill: the
 * other partner (optionally into one of their accounts) or a joint account. The
 * bill stays unpaid until it is paid; the settle-up counts the share as paid by the sender.
 */
export async function sendShare(
  workspaceId: string,
  userId: string,
  id: string,
  input: { month: string; amount: number; date?: string; fromUserId?: string; fromAccountId?: string | null; toUserId?: string | null; toAccountId?: string | null },
) {
  const early = input.month === addMonths(currentMonth(), 1);
  if (!early) assertMonthStarted(input.month);
  const c = await commitmentRepository.findById(workspaceId, id);
  if (!c) throw notFound('Commitment');
  if (c.type !== 'common') throw badRequest('Only a common commitment’s share can be sent to your partner');
  const from = input.fromUserId ?? userId;
  await assertMember(workspaceId, from, 'fromUserId');
  await assertAccount(workspaceId, input.fromAccountId);
  let to = input.toUserId ?? null;
  if (input.toAccountId) {
    const acc = await Account.findOne({ _id: input.toAccountId, workspaceId }).lean();
    if (!acc) throw badRequest('Unknown account');
    to = acc.type === 'common' ? null : String(acc.ownerId); // a joint account belongs to both
  } else if (!to) {
    throw badRequest('Choose who receives the share');
  }
  if (to) await assertMember(workspaceId, to, 'toUserId');
  if (to === from) throw badRequest('Send the share to your partner or a joint account');
  if (input.fromAccountId && input.fromAccountId === input.toAccountId) throw badRequest('Choose two different accounts');
  const date = early
    ? today()
    : input.date && input.date.startsWith(input.month) ? input.date : today().startsWith(input.month) ? today() : dateInMonth(input.month, c.dueDay ?? 1);
  const doc = await Contribution.create({
    workspaceId, commitmentId: id, month: input.month, date, fromUserId: from, toUserId: to ?? undefined,
    fromAccountId: input.fromAccountId || undefined, toAccountId: input.toAccountId || undefined,
    amount: round2(input.amount), createdBy: userId,
  });
  return toSent(doc.toObject());
}

/** Undoes a share sent by mistake. */
export async function cancelShare(workspaceId: string, id: string, contributionId: string) {
  const doc = await Contribution.findOne({ _id: contributionId, workspaceId, commitmentId: id, status: 'active' });
  if (!doc) throw notFound('Share');
  doc.status = 'archived';
  await doc.save();
  return { id: contributionId, archived: true };
}
