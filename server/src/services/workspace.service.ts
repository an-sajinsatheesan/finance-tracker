import { Types } from 'mongoose';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { workspaceRepository, userRepository } from '../repositories/workspace.repository.js';
import { incomeRepository } from '../repositories/income.repository.js';
import { addMonths, currentMonth, dateInMonth } from '../utils/month.js';
import { User } from '../models/index.js';

export async function getWorkspace(workspaceId: string) {
  const ws = await workspaceRepository.findByIdLean(workspaceId);
  if (!ws) throw notFound('Workspace');
  return ws;
}

export async function memberIds(workspaceId: string): Promise<string[]> {
  const ws = await getWorkspace(workspaceId);
  return ws.members.map((m) => String(m.userId));
}

/** Workspace-level authorization for referenced users (paidBy, ownerId, ...). */
export async function assertMember(workspaceId: string, userId: string | null | undefined, field = 'user') {
  if (!userId) return;
  const ids = await memberIds(workspaceId);
  if (!ids.includes(String(userId))) throw badRequest(`${field} is not a member of this workspace`);
}

export function serializeWorkspace(ws: Awaited<ReturnType<typeof getWorkspace>>) {
  return {
    id: String(ws._id),
    name: ws.name,
    currency: ws.currency,
    setupCompleted: ws.setupCompleted,
    startMonth: ws.startMonth,
    members: ws.members.map((m) => ({
      userId: String(m.userId),
      displayName: m.displayName,
      relationship: m.relationship,
      incomeSources: m.incomeSources,
    })),
  };
}

type MemberInput = {
  userId: string;
  displayName: string;
  relationship: string;
  incomeSources?: { key?: string; source: string; amount: number; expectedDay: number; active: boolean }[];
};

export async function updateWorkspace(workspaceId: string, input: { name?: string; members?: MemberInput[] }) {
  const ws = await workspaceRepository.findById(workspaceId);
  if (!ws) throw notFound('Workspace');
  if (input.name) ws.name = input.name;
  if (input.members) {
    for (const m of input.members) {
      const existing = ws.members.find((x) => String(x.userId) === m.userId);
      if (!existing) throw badRequest('Unknown member');
      existing.displayName = m.displayName;
      existing.relationship = m.relationship;
      if (m.incomeSources) {
        existing.incomeSources = m.incomeSources.map((s) => ({
          ...s,
          key: s.key || new Types.ObjectId().toHexString(),
        })) as never;
      }
      await User.updateOne({ _id: m.userId }, { $set: { displayName: m.displayName, relationship: m.relationship } });
    }
  }
  await ws.save();
  return serializeWorkspace(ws.toObject());
}

export async function completeSetup(workspaceId: string, startMonth: string) {
  const ws = await workspaceRepository.findById(workspaceId);
  if (!ws) throw notFound('Workspace');
  if (ws.setupCompleted) throw new AppError(409, 'Setup is already completed');
  ws.startMonth = startMonth;
  ws.setupCompleted = true;
  ws.setupCompletedAt = new Date();
  await ws.save();
  return serializeWorkspace(ws.toObject());
}

/**
 * Generates the month's expected income from each member's income sources,
 * exactly once per month. After that, the month's records are independent:
 * editing income sources later never rewrites historical months.
 * Only months from the workspace start month up to next month are generated.
 */
export async function ensureMonthIncome(workspaceId: string, month: string) {
  const ws = await getWorkspace(workspaceId);
  if (!ws.setupCompleted) return;
  if (month < ws.startMonth || month > addMonths(currentMonth(), 1)) return;
  const claimed = await incomeRepository.claimMonth(workspaceId, month);
  if (!claimed) return;
  const docs = ws.members.flatMap((m) =>
    m.incomeSources
      .filter((s) => s.active && s.amount > 0)
      .map((s) => ({
        workspaceId: ws._id,
        userId: m.userId,
        month,
        source: s.source,
        sourceKey: s.key,
        expectedAmount: s.amount,
        receivedAmount: 0,
        expectedDate: dateInMonth(month, s.expectedDay ?? 1),
        status: 'expected',
      })),
  );
  if (docs.length) await incomeRepository.insertMany(docs);
}

export async function listMembers(workspaceId: string) {
  const users = await userRepository.findByWorkspace(workspaceId);
  return users.map((u) => ({ id: String(u._id), username: u.username, displayName: u.displayName, relationship: u.relationship }));
}
