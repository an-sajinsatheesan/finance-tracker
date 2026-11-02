import { badRequest, notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { currentMonth } from '../utils/month.js';
import { expenseRepository } from '../repositories/expense.repository.js';
import { commitmentRepository } from '../repositories/commitment.repository.js';
import { assertMember, incomeByMember, memberIds } from './workspace.service.js';
import { buildShares } from './expense.logic.js';
import { amountFor, splitWeights } from './commitment.logic.js';
import { assertLookup } from './lookup.service.js';
import { assertAccount } from './account.service.js';

type ExpenseInput = {
  date: string; description: string; category: string; customCategory: string; amount: number;
  paidBy: string; type: 'personal' | 'common'; ownerId?: string | null; notes: string; commitmentId?: string | null;
  accountId?: string | null;
  /** Budget month when it differs from the date's month (next month's commitment paid early). */
  month?: string;
  settlesCommitment?: boolean;
};

/**
 * Share options for a commitment payment: a common bill follows the commitment's
 * split; someone paying their partner's personal commitment supports them, so the
 * cost is theirs (it is not owed back).
 */
async function shareOptions(
  workspaceId: string, members: string[], c: { type?: string; split?: any } | null,
  e: { type: string; month: string; paidBy: string; ownerId: string | null },
) {
  if (!c) return {};
  if (e.type === 'personal') return { bearer: e.paidBy !== e.ownerId ? e.paidBy : null };
  if (c.type !== 'common' || !c.split?.mode || c.split.mode === 'equal') return {};
  const income = c.split.mode === 'income' ? await incomeByMember(workspaceId, e.month) : {};
  return { weights: splitWeights(c.split, members, income) };
}

/** Expenses cannot be recorded in advance: a month opens for expenses on its 1st day. */
export function assertMonthStarted(month: string) {
  if (month > currentMonth()) throw badRequest(`${month} has not started yet. Expenses can be added from the 1st of the month.`);
}

export async function listExpenses(workspaceId: string, month: string, includeArchived = false) {
  return expenseRepository.listByMonth(workspaceId, month, includeArchived);
}

export async function createExpense(workspaceId: string, userId: string, input: ExpenseInput) {
  assertMonthStarted(input.date.slice(0, 7));
  const members = await memberIds(workspaceId);
  if (!members.includes(input.paidBy)) throw badRequest('paidBy is not a member of this workspace');
  // A personal expense belongs to its owner (defaults to whoever paid).
  const ownerId = input.type === 'personal' ? input.ownerId || input.paidBy : null;
  if (ownerId) await assertMember(workspaceId, ownerId, 'ownerId');
  await assertLookup(workspaceId, 'category', input.category, 'category');
  await assertAccount(workspaceId, input.accountId);
  const c = input.commitmentId ? await commitmentRepository.findById(workspaceId, input.commitmentId) : null;
  if (input.commitmentId && !c) throw badRequest('Unknown commitment');
  const amount = round2(input.amount);
  const month = input.month ?? input.date.slice(0, 7);
  const opts = await shareOptions(workspaceId, members, c, { type: input.type, month, paidBy: input.paidBy, ownerId });
  return expenseRepository.create({
    workspaceId,
    date: input.date,
    month,
    description: input.description,
    category: input.category,
    customCategory: input.category === 'Custom' ? input.customCategory : '',
    amount,
    paidBy: input.paidBy,
    type: input.type,
    ownerId: ownerId ?? undefined,
    shares: buildShares(input.type, amount, members, ownerId, opts),
    commitmentId: input.commitmentId ?? undefined,
    settlesCommitment: input.commitmentId ? input.settlesCommitment : undefined,
    accountId: input.accountId || undefined,
    notes: input.notes ?? '',
    createdBy: userId,
  });
}

export async function updateExpense(workspaceId: string, id: string, input: Partial<ExpenseInput>) {
  const doc = await expenseRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Expense');
  if (doc.status === 'archived') throw badRequest('Restore the expense before editing it');
  if (input.date) assertMonthStarted(input.date.slice(0, 7));
  const members = await memberIds(workspaceId);
  if (input.paidBy && !members.includes(input.paidBy)) throw badRequest('paidBy is not a member of this workspace');
  if (input.category && input.category !== doc.category) await assertLookup(workspaceId, 'category', input.category, 'category');
  const dateChanged = !!input.date && input.date !== doc.date;
  for (const k of ['date', 'description', 'category', 'customCategory', 'paidBy', 'notes'] as const) {
    if (input[k] !== undefined) doc.set(k, input[k]);
  }
  if (input.accountId !== undefined) {
    await assertAccount(workspaceId, input.accountId);
    doc.set('accountId', input.accountId || undefined);
  }
  if (input.amount !== undefined) doc.amount = round2(input.amount);
  if (input.type) doc.type = input.type;
  if (dateChanged) doc.month = doc.date.slice(0, 7); // an early payment keeps its budget month while the date stays
  if (doc.category !== 'Custom') doc.customCategory = '';
  let ownerId: string | null = null;
  if (doc.type === 'personal') {
    ownerId = input.ownerId || (doc.ownerId ? String(doc.ownerId) : null) || String(doc.paidBy);
    await assertMember(workspaceId, ownerId, 'ownerId');
  }
  doc.set('ownerId', ownerId ?? undefined);
  const c = doc.commitmentId ? await commitmentRepository.findById(workspaceId, String(doc.commitmentId)) : null;
  const opts = await shareOptions(workspaceId, members, c, { type: doc.type, month: doc.month, paidBy: String(doc.paidBy), ownerId });
  doc.set('shares', buildShares(doc.type, doc.amount, members, ownerId, opts));
  if (c && input.amount !== undefined) {
    // A bill payment whose amount changed: it settles the bill only if the payments now cover it
    // (e.g. a full payment corrected to just one partner's share leaves the rest to pay).
    const others = (await expenseRepository.listForCommitment(workspaceId, String(c._id), doc.month)).filter((x) => String(x._id) !== id);
    doc.settlesCommitment = others.reduce((a, x) => a + x.amount, 0) + doc.amount >= amountFor(c, doc.month) - 0.005;
  }
  await doc.save();
  return doc;
}

export async function setExpenseArchived(workspaceId: string, userId: string, id: string, archived: boolean) {
  const doc = await expenseRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Expense');
  doc.status = archived ? 'archived' : 'active';
  doc.set('archivedAt', archived ? new Date() : undefined);
  doc.set('archivedBy', archived ? userId : undefined);
  await doc.save();
  return doc;
}
