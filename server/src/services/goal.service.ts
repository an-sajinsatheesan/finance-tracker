import { badRequest, notFound } from '../utils/AppError.js';
import { round2, sum } from '../utils/money.js';
import { goalRepository } from '../repositories/goal.repository.js';
import { assertMember } from './workspace.service.js';

export async function listGoals(workspaceId: string) {
  const [goals, allocations] = await Promise.all([
    goalRepository.list(workspaceId),
    goalRepository.listAllocations(workspaceId, { status: 'active' }),
  ]);
  return goals.map((g) => {
    const mine = allocations.filter((a) => String(a.goalId) === String(g._id));
    return { ...g, allocatedTotal: sum(mine.map((a) => a.amount)) };
  });
}

export async function createGoal(workspaceId: string, input: { name: string; targetAmount: number; type: 'personal' | 'common'; ownerId?: string | null; notes: string }) {
  if (input.type === 'personal') await assertMember(workspaceId, input.ownerId, 'ownerId');
  return goalRepository.create({
    workspaceId,
    name: input.name,
    targetAmount: round2(input.targetAmount),
    type: input.type,
    ownerId: input.type === 'personal' ? input.ownerId : undefined,
    notes: input.notes,
  });
}

export async function updateGoal(workspaceId: string, id: string, input: Record<string, unknown>) {
  const doc = await goalRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Goal');
  for (const [k, v] of Object.entries(input)) if (v !== undefined) doc.set(k, v);
  await doc.save();
  return doc;
}

export async function listAllocations(workspaceId: string, month?: string) {
  return goalRepository.listAllocations(workspaceId, month ? { month } : {});
}

export async function createAllocation(workspaceId: string, goalId: string, input: { userId: string; date: string; amount: number; note: string }) {
  const goal = await goalRepository.findById(workspaceId, goalId);
  if (!goal) throw notFound('Goal');
  if (goal.status !== 'active') throw badRequest('Goal is not active');
  await assertMember(workspaceId, input.userId, 'userId');
  if (goal.type === 'personal' && String(goal.ownerId) !== input.userId) {
    throw badRequest("Only the goal's owner can allocate to a personal goal");
  }
  return goalRepository.createAllocation({
    workspaceId, goalId, userId: input.userId, month: input.date.slice(0, 7), date: input.date,
    amount: round2(input.amount), note: input.note,
  });
}

export async function setAllocationArchived(workspaceId: string, id: string, archived: boolean) {
  const doc = await goalRepository.findAllocation(workspaceId, id);
  if (!doc) throw notFound('Allocation');
  doc.status = archived ? 'archived' : 'active';
  await doc.save();
  return doc;
}
