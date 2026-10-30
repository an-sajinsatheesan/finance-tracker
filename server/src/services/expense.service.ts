import { badRequest, notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { expenseRepository } from '../repositories/expense.repository.js';
import { commitmentRepository } from '../repositories/commitment.repository.js';
import { assertMember, memberIds } from './workspace.service.js';
import { buildShares } from './expense.logic.js';

type ExpenseInput = {
  date: string; description: string; category: string; customCategory: string; amount: number;
  paidBy: string; type: 'personal' | 'common'; ownerId?: string | null; notes: string; commitmentId?: string | null;
};

export async function listExpenses(workspaceId: string, month: string, includeArchived = false) {
  return expenseRepository.listByMonth(workspaceId, month, includeArchived);
}

export async function createExpense(workspaceId: string, userId: string, input: ExpenseInput) {
  const members = await memberIds(workspaceId);
  if (!members.includes(input.paidBy)) throw badRequest('paidBy is not a member of this workspace');
  // A personal expense belongs to its owner (defaults to whoever paid).
  const ownerId = input.type === 'personal' ? input.ownerId || input.paidBy : null;
  if (ownerId) await assertMember(workspaceId, ownerId, 'ownerId');
  if (input.commitmentId) {
    const c = await commitmentRepository.findById(workspaceId, input.commitmentId);
    if (!c) throw badRequest('Unknown commitment');
  }
  const amount = round2(input.amount);
  return expenseRepository.create({
    workspaceId,
    date: input.date,
    month: input.date.slice(0, 7),
    description: input.description,
    category: input.category,
    customCategory: input.category === 'Custom' ? input.customCategory : '',
    amount,
    paidBy: input.paidBy,
    type: input.type,
    ownerId: ownerId ?? undefined,
    shares: buildShares(input.type, amount, members, ownerId),
    commitmentId: input.commitmentId ?? undefined,
    notes: input.notes ?? '',
    createdBy: userId,
  });
}

export async function updateExpense(workspaceId: string, id: string, input: Partial<ExpenseInput>) {
  const doc = await expenseRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Expense');
  if (doc.status === 'archived') throw badRequest('Restore the expense before editing it');
  const members = await memberIds(workspaceId);
  if (input.paidBy && !members.includes(input.paidBy)) throw badRequest('paidBy is not a member of this workspace');
  for (const k of ['date', 'description', 'category', 'customCategory', 'paidBy', 'notes'] as const) {
    if (input[k] !== undefined) doc.set(k, input[k]);
  }
  if (input.amount !== undefined) doc.amount = round2(input.amount);
  if (input.type) doc.type = input.type;
  doc.month = doc.date.slice(0, 7);
  if (doc.category !== 'Custom') doc.customCategory = '';
  let ownerId: string | null = null;
  if (doc.type === 'personal') {
    ownerId = input.ownerId || (doc.ownerId ? String(doc.ownerId) : null) || String(doc.paidBy);
    await assertMember(workspaceId, ownerId, 'ownerId');
  }
  doc.set('ownerId', ownerId ?? undefined);
  doc.set('shares', buildShares(doc.type, doc.amount, members, ownerId));
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
