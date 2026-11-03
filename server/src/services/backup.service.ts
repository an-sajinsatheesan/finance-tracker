import mongoose, { type Model } from 'mongoose';
import { z } from 'zod';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { round2, sum } from '../utils/money.js';
import {
  Account, AccountBalance, Backup, Commitment, Contract, Contribution, Deposit, Expense, GoldItem, GoldPrice, Goal, GoalAllocation, Income, IncomeMonth, Lookup, Transfer, User, Workspace,
} from '../models/index.js';

export const BACKUP_APP = 'couple-finance-tracker';
/** v2 adds accounts, balances, transfers, custom lookups, workspace mode and FX rates. v1 files still restore. */
export const BACKUP_SCHEMA_VERSION = 2;

/** Collections included in a workspace backup, in restore order. */
const COLLECTIONS = {
  incomes: Income,
  incomeMonths: IncomeMonth,
  commitments: Commitment,
  expenses: Expense,
  goals: Goal,
  allocations: GoalAllocation,
  lookups: Lookup, // only the workspace's own custom values
  accounts: Account,
  accountBalances: AccountBalance,
  transfers: Transfer,
  contributions: Contribution, // partners' shares of common bills sent to each other
  contracts: Contract, // rent contracts and their cheques
  deposits: Deposit,
  goldItems: GoldItem,
  goldPrices: GoldPrice,
} as const satisfies Record<string, Model<any>>;
type CollectionKey = keyof typeof COLLECTIONS;

// ---------- Export ----------

export async function exportWorkspace(workspaceId: string) {
  const ws = await Workspace.findById(workspaceId).lean();
  if (!ws) throw notFound('Workspace');
  const users = await User.find({ workspaceId }).lean();
  const entries = await Promise.all(
    (Object.keys(COLLECTIONS) as CollectionKey[]).map(async (k) => [k, await (COLLECTIONS[k] as Model<any>).find({ workspaceId }).lean()] as const),
  );
  const data = Object.fromEntries(entries) as Record<CollectionKey, unknown[]>;
  const backup = {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: {
      _id: ws._id, name: ws.name, mode: ws.mode, currency: ws.currency, fxRates: ws.fxRates, members: ws.members,
      setupCompleted: ws.setupCompleted, setupCompletedAt: ws.setupCompletedAt, startMonth: ws.startMonth,
    },
    // Password hashes are never exported. Users are matched by username on restore.
    users: users.map((u) => ({ _id: u._id, username: u.username, email: u.email, displayName: u.displayName, relationship: u.relationship })),
    counts: Object.fromEntries(entries.map(([k, v]) => [k, v.length])),
    data,
  };
  // Normalise ObjectIds/Dates to plain JSON.
  return JSON.parse(JSON.stringify(backup)) as BackupFile;
}

// ---------- Validation ----------

const oid = z.string().regex(/^[a-f\d]{24}$/i);
const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = z.number().finite();
const base = z.object({ _id: oid, workspaceId: oid }).passthrough();

const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  schemaVersion: z.number().int(),
  exportedAt: z.string().datetime(),
  workspace: z.object({
    _id: oid, name: z.string().min(1), currency: z.string(), setupCompleted: z.boolean(), startMonth: monthStr,
    mode: z.enum(['personal', 'couple']).optional(), fxRates: z.record(num).optional(),
    setupCompletedAt: z.string().optional().nullable(),
    members: z.array(z.object({
      userId: oid, displayName: z.string(), relationship: z.string().optional(),
      incomeSources: z.array(z.object({ key: z.string(), source: z.string(), amount: num, expectedDay: z.number().optional(), paidPreviousMonth: z.boolean().optional(), active: z.boolean().optional(), accountId: oid.optional().nullable() })),
    })).min(1),
  }),
  users: z.array(z.object({ _id: oid, username: z.string().min(1), email: z.string().nullable().optional(), displayName: z.string(), relationship: z.string().optional() })).min(1),
  counts: z.record(z.number()).optional(),
  data: z.object({
    incomes: z.array(base.extend({ userId: oid, month: monthStr, source: z.string(), expectedAmount: num, receivedAmount: num.optional(), status: z.string() })),
    incomeMonths: z.array(base.extend({ month: monthStr })),
    commitments: z.array(base.extend({
      title: z.string(), category: z.string(), type: z.enum(['personal', 'common']), startMonth: monthStr,
      endMonth: monthStr.nullable().optional(), amountHistory: z.array(z.object({ fromMonth: monthStr, amount: num })).min(1),
    })),
    expenses: z.array(base.extend({
      date: dateStr, month: monthStr, description: z.string(), category: z.string(), amount: num, paidBy: oid,
      type: z.enum(['personal', 'common']), shares: z.array(z.object({ userId: oid, amount: num })).min(1),
      status: z.enum(['active', 'archived']).optional(), commitmentId: oid.optional().nullable(),
    })),
    goals: z.array(base.extend({ name: z.string(), type: z.enum(['personal', 'common']) })),
    allocations: z.array(base.extend({ goalId: oid, userId: oid, month: monthStr, date: dateStr, amount: num })),
    // Added in schema v2 — absent in v1 files.
    lookups: z.array(base.extend({ type: z.string(), code: z.string(), label: z.string() })).default([]),
    accounts: z.array(base.extend({ name: z.string(), bank: z.string(), currency: z.string(), accountType: z.string(), type: z.enum(['personal', 'common']), openedMonth: monthStr })).default([]),
    accountBalances: z.array(base.extend({ accountId: oid, month: monthStr, balance: num })).default([]),
    transfers: z.array(base.extend({ fromAccountId: oid, toAccountId: oid, date: dateStr, month: monthStr, amount: num, toAmount: num })).default([]),
    contributions: z.array(base.extend({ commitmentId: oid, fromUserId: oid, month: monthStr, date: dateStr, amount: num })).default([]),
    contracts: z.array(base.extend({ name: z.string(), startDate: dateStr, months: num, totalAmount: num })).default([]),
    deposits: z.array(base.extend({ name: z.string(), amount: num })).default([]),
    goldItems: z.array(base.extend({ name: z.string(), grams: num })).default([]),
    goldPrices: z.array(base.extend({ currency: z.string() })).default([]),
  }),
});
export type BackupFile = z.infer<typeof backupSchema>;

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  summary?: { exportedAt: string; schemaVersion: number; workspaceName: string; counts: Record<string, number> };
}

/** Structural + referential validation. Returns readable errors instead of throwing. */
export async function validateBackup(raw: unknown, workspaceId: string): Promise<ValidationReport & { backup?: BackupFile; userMap?: Map<string, string> }> {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`),
    };
  }
  const b = parsed.data;
  const errors: string[] = [];
  if (b.schemaVersion > BACKUP_SCHEMA_VERSION) errors.push(`Backup schema v${b.schemaVersion} is newer than this app (v${BACKUP_SCHEMA_VERSION}).`);

  // Map backup users to the current workspace users by username.
  const current = await User.find({ workspaceId }).lean();
  const userMap = new Map<string, string>();
  for (const u of b.users) {
    const match = current.find((c) => c.username === u.username.toLowerCase());
    if (!match) errors.push(`User "${u.username}" in the backup does not exist in this workspace.`);
    else userMap.set(u._id, String(match._id));
  }

  // Referential integrity inside the file.
  const userIds = new Set(b.users.map((u) => u._id));
  const commitmentIds = new Set(b.data.commitments.map((c) => c._id));
  const goalIds = new Set(b.data.goals.map((g) => g._id));
  const wid = b.workspace._id;
  for (const [key, docs] of Object.entries(b.data)) {
    for (const d of docs as { _id: string; workspaceId: string }[]) {
      if (d.workspaceId !== wid) errors.push(`${key} ${d._id}: belongs to a different workspace.`);
    }
  }
  for (const e of b.data.expenses) {
    if (!userIds.has(e.paidBy)) errors.push(`Expense ${e._id}: unknown paidBy.`);
    if (e.shares.some((s) => !userIds.has(s.userId))) errors.push(`Expense ${e._id}: unknown user in shares.`);
    if (Math.abs(sum(e.shares.map((s) => s.amount)) - round2(e.amount)) > 0.01) errors.push(`Expense ${e._id}: shares do not add up to the amount.`);
    if (e.date.slice(0, 7) !== e.month) errors.push(`Expense ${e._id}: month does not match date.`);
    if (e.commitmentId && !commitmentIds.has(e.commitmentId)) errors.push(`Expense ${e._id}: unknown commitment.`);
  }
  for (const i of b.data.incomes) if (!userIds.has(i.userId)) errors.push(`Income ${i._id}: unknown user.`);
  const accountIds = new Set(b.data.accounts.map((a) => a._id));
  for (const x of b.data.accountBalances) if (!accountIds.has(x.accountId)) errors.push(`Balance ${x._id}: unknown account.`);
  for (const t of b.data.transfers) {
    if (!accountIds.has(t.fromAccountId) || !accountIds.has(t.toAccountId)) errors.push(`Transfer ${t._id}: unknown account.`);
  }
  for (const a of b.data.allocations) {
    if (!goalIds.has(a.goalId)) errors.push(`Allocation ${a._id}: unknown goal.`);
    if (!userIds.has(a.userId)) errors.push(`Allocation ${a._id}: unknown user.`);
  }

  // Finally, every document must pass the Mongoose schema.
  if (!errors.length) {
    const remapped = remap(b, workspaceId, userMap);
    for (const k of Object.keys(COLLECTIONS) as CollectionKey[]) {
      for (const d of remapped.data[k] as Record<string, unknown>[]) {
        const err = new (COLLECTIONS[k] as Model<any>)(d).validateSync();
        if (err) errors.push(`${k} ${String(d._id)}: ${err.message}`);
        if (errors.length > 20) break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.slice(0, 20),
    summary: {
      exportedAt: b.exportedAt, schemaVersion: b.schemaVersion, workspaceName: b.workspace.name,
      counts: Object.fromEntries(Object.entries(b.data).map(([k, v]) => [k, v.length])),
    },
    backup: b,
    userMap,
  };
}

/** Rewrites workspace and user ids so a backup can be restored into the current workspace. */
function remap(b: BackupFile, workspaceId: string, userMap: Map<string, string>): BackupFile {
  const userKeys = new Set(['userId', 'paidBy', 'ownerId', 'createdBy', 'archivedBy', 'updatedBy', 'fromUserId', 'toUserId']);
  const walk = (v: unknown, key?: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    }
    if (typeof v === 'string' && key === 'workspaceId') return workspaceId;
    if (typeof v === 'string' && key && userKeys.has(key)) return userMap.get(v) ?? v;
    return v;
  };
  return walk(b) as BackupFile;
}

// ---------- Snapshots & restore ----------

export async function createSnapshot(workspaceId: string, reason: 'pre-restore' | 'manual', userId?: string) {
  const data = await exportWorkspace(workspaceId);
  const payload = JSON.stringify(data);
  const doc = await Backup.create({
    workspaceId, reason, createdBy: userId, schemaVersion: BACKUP_SCHEMA_VERSION, payload, sizeBytes: Buffer.byteLength(payload),
  });
  return { id: String(doc._id), createdAt: doc.createdAt, data };
}

export async function listSnapshots(workspaceId: string) {
  const docs = await Backup.find({ workspaceId }).select('-payload').sort({ createdAt: -1 }).limit(50).lean();
  return docs.map((d) => ({ id: String(d._id), reason: d.reason, createdAt: d.createdAt, sizeBytes: d.sizeBytes, schemaVersion: d.schemaVersion }));
}

export async function getSnapshot(workspaceId: string, id: string) {
  const doc = await Backup.findOne({ _id: id, workspaceId }).lean();
  if (!doc) throw notFound('Backup');
  return JSON.parse(doc.payload) as BackupFile;
}

/** Transactions need a replica set or sharded cluster (MongoDB Atlas always is one). */
async function supportsTransactions(): Promise<boolean> {
  try {
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    return Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch {
    return false;
  }
}

/** Runs fn inside a transaction when the server supports it; otherwise runs it directly. */
async function maybeTransaction(fn: (session?: mongoose.ClientSession) => Promise<void>) {
  if (!(await supportsTransactions())) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}

async function replaceWorkspaceData(workspaceId: string, b: BackupFile, session?: mongoose.ClientSession) {
  const opts = session ? { session } : {};
  for (const k of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const model = COLLECTIONS[k] as Model<any>;
    await model.deleteMany({ workspaceId }, opts);
    const docs = (b.data[k] as Record<string, unknown>[]).map((d) => new model(d).toObject({ depopulate: true }));
    if (docs.length) await model.collection.insertMany(docs, opts);
  }
  await Workspace.updateOne(
    { _id: workspaceId },
    {
      $set: {
        name: b.workspace.name, currency: b.workspace.currency, startMonth: b.workspace.startMonth,
        mode: b.workspace.mode ?? (b.workspace.members.length > 1 ? 'couple' : 'personal'),
        ...(b.workspace.fxRates ? { fxRates: b.workspace.fxRates } : {}),
        setupCompleted: b.workspace.setupCompleted,
        setupCompletedAt: b.workspace.setupCompletedAt ? new Date(b.workspace.setupCompletedAt) : undefined,
        members: b.workspace.members.map((m) => ({ ...m, userId: new mongoose.Types.ObjectId(m.userId) })),
      },
    },
    opts,
  );
  for (const m of b.workspace.members) {
    await User.updateOne({ _id: m.userId }, { $set: { displayName: m.displayName, relationship: m.relationship ?? '' } }, opts);
  }
}

/**
 * Validates, snapshots the current data, then replaces the workspace data with the backup.
 * If anything fails, the snapshot is put back.
 */
export async function restoreWorkspace(workspaceId: string, raw: unknown, userId?: string) {
  const report = await validateBackup(raw, workspaceId);
  if (!report.valid || !report.backup || !report.userMap) {
    throw badRequest('Backup file is not valid', { errors: report.errors });
  }
  const snapshot = await createSnapshot(workspaceId, 'pre-restore', userId);
  const remapped = remap(report.backup, workspaceId, report.userMap);
  try {
    await maybeTransaction((session) => replaceWorkspaceData(workspaceId, remapped, session));
  } catch (err) {
    console.error('Restore failed, rolling back to pre-restore snapshot', err);
    const prev = remap(snapshot.data, workspaceId, new Map());
    await replaceWorkspaceData(workspaceId, prev);
    throw new AppError(500, 'Restore failed. Your previous data was put back.');
  }
  return { restored: true, preRestoreBackupId: snapshot.id, summary: report.summary };
}
