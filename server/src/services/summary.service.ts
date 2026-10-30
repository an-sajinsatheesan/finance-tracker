import { badRequest } from '../utils/AppError.js';
import { monthRange } from '../utils/month.js';
import { incomeRepository } from '../repositories/income.repository.js';
import { expenseRepository } from '../repositories/expense.repository.js';
import { commitmentRepository } from '../repositories/commitment.repository.js';
import { goalRepository } from '../repositories/goal.repository.js';
import { ensureMonthIncome, memberIds } from './workspace.service.js';
import {
  computeBudgetVsActual, computeCards, computeCommitmentsDue, computeDaily, computeTrend, type Dataset,
} from './summary.logic.js';

const TREND_MONTHS = 6;

export async function getSummary(workspaceId: string, month: string, scope: string) {
  const members = await memberIds(workspaceId);
  if (scope !== 'common' && !members.includes(scope)) throw badRequest('Unknown scope');
  await ensureMonthIncome(workspaceId, month);
  const months = monthRange(month, TREND_MONTHS);
  const [incomes, expenses, commitments, allocations] = await Promise.all([
    incomeRepository.listByMonths(workspaceId, months),
    expenseRepository.listActiveByMonths(workspaceId, months),
    commitmentRepository.listOverlapping(workspaceId, months[0], month),
    goalRepository.listActiveAllocationsByMonths(workspaceId, months),
  ]);
  const data: Dataset = {
    memberIds: members,
    incomes: incomes.map((i) => ({ userId: String(i.userId), month: i.month, expectedAmount: i.expectedAmount, receivedAmount: i.receivedAmount ?? 0, status: i.status })),
    expenses: expenses.map((e) => ({
      id: String(e._id), month: e.month, date: e.date, amount: e.amount, type: e.type, category: e.category,
      customCategory: e.customCategory, paidBy: String(e.paidBy), ownerId: e.ownerId ? String(e.ownerId) : null,
      shares: e.shares.map((s) => ({ userId: String(s.userId), amount: s.amount })),
      commitmentId: e.commitmentId ? String(e.commitmentId) : null,
    })),
    commitments: commitments.map((c) => ({
      id: String(c._id), title: c.title, type: c.type, ownerId: c.ownerId ? String(c.ownerId) : null,
      category: c.category, customCategory: c.customCategory, dueDay: c.dueDay ?? 1,
      amountHistory: c.amountHistory, startMonth: c.startMonth, endMonth: c.endMonth, archived: c.archived,
    })),
    allocations: allocations.map((a) => ({ userId: String(a.userId), month: a.month, amount: a.amount })),
  };
  return {
    month,
    scope,
    cards: computeCards(data, month, scope),
    budgetVsActual: computeBudgetVsActual(data, month, scope),
    daily: computeDaily(data, month, scope),
    trend: computeTrend(data, months, scope),
    commitmentsDue: computeCommitmentsDue(data, month, scope),
  };
}
