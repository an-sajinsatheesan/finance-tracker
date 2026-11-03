import { Types } from 'mongoose';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { workspaceRepository, userRepository } from '../repositories/workspace.repository.js';
import { incomeRepository } from '../repositories/income.repository.js';
import { addMonths, currentMonth, dateInMonth } from '../utils/month.js';
import { Account, User } from '../models/index.js';

/** Expected pay date of a recurring source for a budget month (may fall in the month before). */
export function expectedDateFor(month: string, s: { expectedDay?: number | null; paidPreviousMonth?: boolean | null }) {
  return dateInMonth(s.paidPreviousMonth ? addMonths(month, -1) : month, s.expectedDay ?? 1);
}
import { assertLookup } from './lookup.service.js';

export async function getWorkspace(workspaceId: string) {
  const ws = await workspaceRepository.findByIdLean(workspaceId);
  if (!ws) throw notFound('Workspace');
  return ws;
}

export async function memberIds(workspaceId: string): Promise<string[]> {
  const ws = await getWorkspace(workspaceId);
  return ws.members.map((m) => String(m.userId));
}

/**
 * Each member's expected income for a month (for "split by salary"): the month's
 * income rows, or the recurring income sources when the month has none yet.
 */
export async function incomeByMember(workspaceId: string, month: string): Promise<Record<string, number>> {
  const rows = await incomeRepository.listByMonths(workspaceId, [month]);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.userId)] = (out[String(r.userId)] ?? 0) + (r.expectedAmount ?? 0);
  if (Object.values(out).some((v) => v > 0)) return out;
  const ws = await getWorkspace(workspaceId);
  for (const m of ws.members) {
    out[String(m.userId)] = (m.incomeSources ?? []).filter((s) => s.active !== false).reduce((a, s) => a + (s.amount ?? 0), 0);
  }
  return out;
}

/** Workspace-level authorization for referenced users (paidBy, ownerId, ...). */
export async function assertMember(workspaceId: string, userId: string | null | undefined, field = 'user') {
  if (!userId) return;
  const ids = await memberIds(workspaceId);
  if (!ids.includes(String(userId))) throw badRequest(`${field} is not a member of this workspace`);
}

type Ws = Awaited<ReturnType<typeof getWorkspace>>;
type UserRow = { _id: unknown; email?: string | null; status?: string | null };

export function serializeWorkspace(ws: Ws, users: UserRow[] = []) {
  const fx = ws.fxRates instanceof Map ? Object.fromEntries(ws.fxRates) : { ...(ws.fxRates ?? {}) };
  return {
    id: String(ws._id),
    name: ws.name,
    mode: ws.mode ?? (ws.members.length > 1 ? 'couple' : 'personal'),
    currency: ws.currency,
    fxRates: fx as Record<string, number>,
    setupCompleted: ws.setupCompleted,
    startMonth: ws.startMonth,
    members: ws.members.map((m) => {
      const u = users.find((x) => String(x._id) === String(m.userId));
      return {
        userId: String(m.userId),
        displayName: m.displayName,
        relationship: m.relationship,
        email: u?.email ?? null,
        status: (u?.status ?? 'active') as 'active' | 'invited' | 'disabled',
        incomeSources: m.incomeSources,
      };
    }),
  };
}

/** Workspace plus each member's account status (active / invited). */
export async function getWorkspaceView(workspaceId: string) {
  const [ws, users] = await Promise.all([getWorkspace(workspaceId), userRepository.findByWorkspace(workspaceId)]);
  return serializeWorkspace(ws, users);
}

type MemberInput = {
  userId: string;
  displayName: string;
  relationship: string;
  incomeSources?: { key?: string; source: string; amount: number; expectedDay: number; active: boolean; accountId?: string | null }[];
};

export async function updateWorkspace(
  workspaceId: string,
  input: { name?: string; members?: MemberInput[]; fxRates?: Record<string, number> },
) {
  const ws = await workspaceRepository.findById(workspaceId);
  if (!ws) throw notFound('Workspace');
  if (input.name) ws.name = input.name;
  if (input.fxRates) {
    for (const [code, rate] of Object.entries(input.fxRates)) {
      await assertLookup(workspaceId, 'currency', code, 'currency');
      ws.fxRates.set(code, rate);
    }
  }
  if (input.members) {
    for (const m of input.members) {
      const existing = ws.members.find((x) => String(x.userId) === m.userId);
      if (!existing) throw badRequest('Unknown member');
      await assertLookup(workspaceId, 'relationship', m.relationship, 'relationship');
      existing.displayName = m.displayName;
      existing.relationship = m.relationship;
      if (m.incomeSources) {
        for (const s of m.incomeSources) {
          await assertLookup(workspaceId, 'incomeSource', s.source, 'income source');
          if (s.accountId && !(await Account.exists({ _id: s.accountId, workspaceId }))) throw badRequest('Unknown account');
        }
        existing.incomeSources = m.incomeSources.map((s) => ({
          ...s,
          accountId: s.accountId || undefined,
          key: s.key || new Types.ObjectId().toHexString(),
        })) as never;
      }
      await User.updateOne({ _id: m.userId, workspaceId }, { $set: { displayName: m.displayName, relationship: m.relationship } });
    }
  }
  await ws.save();
  return getWorkspaceView(workspaceId);
}

export async function completeSetup(workspaceId: string, startMonth: string) {
  const ws = await workspaceRepository.findById(workspaceId);
  if (!ws) throw notFound('Workspace');
  if (ws.setupCompleted) throw new AppError(409, 'Setup is already completed');
  ws.startMonth = startMonth;
  ws.setupCompleted = true;
  ws.setupCompletedAt = new Date();
  await ws.save();
  return getWorkspaceView(workspaceId);
}

/**
 * Generates the month's expected income from each member's recurring income,
 * exactly once per month. After that, the month's records are independent:
 * editing recurring income later never rewrites historical months.
 * Only months from the workspace start month up to next month are generated.
 */
export async function ensureMonthIncome(workspaceId: string, month: string) {
  const ws = await getWorkspace(workspaceId);
  if (!ws.setupCompleted) return;
  if (month < ws.startMonth || month > addMonths(currentMonth(), 1)) return;
  if (await incomeRepository.isMonthGenerated(workspaceId, month)) return;
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
        expectedDate: expectedDateFor(month, s),
        status: 'expected',
        accountId: s.accountId ?? undefined,
      })),
  );
  // Rows first, then the marker: a request that sees the marker always sees the rows.
  await incomeRepository.insertGenerated(docs);
  await incomeRepository.markMonthGenerated(workspaceId, month);
}

/**
 * Recurring income changed for months already generated: adds the missing
 * rows (new sources) to `month` and updates still-untouched expected rows.
 * Rows with money received are never changed.
 */
export async function syncMonthIncome(workspaceId: string, month: string) {
  const ws = await getWorkspace(workspaceId);
  if (!ws.setupCompleted || month < ws.startMonth) return;
  await ensureMonthIncome(workspaceId, month);
  const existing = await incomeRepository.listByMonth(workspaceId, month);
  for (const m of ws.members) {
    for (const s of m.incomeSources.filter((x) => x.active && x.amount > 0)) {
      const row = existing.find((i) => i.sourceKey === s.key && String(i.userId) === String(m.userId));
      if (!row) {
        await incomeRepository.create({
          workspaceId: ws._id, userId: m.userId, month, source: s.source, sourceKey: s.key, expectedAmount: s.amount,
          receivedAmount: 0, expectedDate: expectedDateFor(month, s), status: 'expected', accountId: s.accountId ?? undefined,
        });
      } else if (row.status === 'expected' && !row.receivedAmount) {
        await incomeRepository.updateExpected(row._id, { source: s.source, expectedAmount: s.amount, expectedDate: expectedDateFor(month, s), accountId: s.accountId ?? undefined });
      }
    }
  }
}

export async function listMembers(workspaceId: string) {
  const users = await userRepository.findByWorkspace(workspaceId);
  return users.map((u) => ({ id: String(u._id), username: u.username, displayName: u.displayName, relationship: u.relationship }));
}
