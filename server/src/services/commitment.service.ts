import { badRequest, notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { currentMonth, dateInMonth, today } from '../utils/month.js';
import { commitmentRepository } from '../repositories/commitment.repository.js';
import { expenseRepository } from '../repositories/expense.repository.js';
import { assertMember } from './workspace.service.js';
import { assertLookup } from './lookup.service.js';
import { amountFor, statusAt, type CommitmentStatus } from './commitment.logic.js';
import { assertMonthStarted, createExpense } from './expense.service.js';

type CreateInput = {
  title: string; category: string; customCategory: string; type: 'personal' | 'common';
  ownerId?: string | null; amount: number; startMonth: string; endMonth?: string | null; dueDay: number; notes: string;
  reminderDaysBefore?: number | null;
};

/** Ensures the first version starts exactly at startMonth and versions are sorted. */
export function normalizeHistory(history: { fromMonth: string; amount: number }[], startMonth: string) {
  const sorted = [...history].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  const atOrBefore = sorted.filter((v) => v.fromMonth <= startMonth);
  const base = atOrBefore[atOrBefore.length - 1] ?? sorted[0];
  return [{ fromMonth: startMonth, amount: base.amount }, ...sorted.filter((v) => v.fromMonth > startMonth)];
}

export function serializeCommitment(c: any, refMonth = currentMonth()) {
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
  };
}

export async function listCommitments(workspaceId: string, refMonth = currentMonth()) {
  const list = await commitmentRepository.list(workspaceId);
  return list.map((c) => serializeCommitment(c, refMonth));
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
  input: { month: string; date?: string; paidBy?: string; amount?: number; accountId?: string | null },
) {
  assertMonthStarted(input.month);
  const c = await commitmentRepository.findById(workspaceId, id);
  if (!c) throw notFound('Commitment');
  const existing = await expenseRepository.findForCommitment(workspaceId, id, input.month);
  if (existing) throw badRequest('This commitment is already recorded as paid for that month');
  const dateStr =
    input.date && input.date.startsWith(input.month)
      ? input.date
      : today().startsWith(input.month) ? today() : dateInMonth(input.month, c.dueDay ?? 1);
  const paidBy = input.paidBy ?? (c.type === 'personal' ? String(c.ownerId) : userId);
  return createExpense(workspaceId, userId, {
    date: dateStr,
    description: c.title,
    category: c.category,
    customCategory: c.customCategory,
    amount: input.amount ?? amountFor(c, input.month),
    paidBy,
    type: c.type,
    ownerId: c.type === 'personal' ? String(c.ownerId) : null,
    notes: '',
    commitmentId: id,
    accountId: input.accountId,
  });
}
