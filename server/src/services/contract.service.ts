import { badRequest, notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { Contract, Deposit } from '../models/index.js';
import { commitmentRepository } from '../repositories/commitment.repository.js';
import { assertMember } from './workspace.service.js';
import { assertAccount } from './account.service.js';
import { updateCommitment } from './commitment.service.js';
import { amountFor } from './commitment.logic.js';
import { addMonthsToDate, chequeSchedule, contractEnd, monthlyAmount } from './contract.logic.js';

type Owner = { type: 'personal' | 'common'; ownerId?: string | null };
export type ContractInput = Owner & {
  name: string; startDate: string; months: number; totalAmount: number; chequeCount: number;
  commitmentId?: string | null; accountId?: string | null; notes?: string;
  /** Cheques already paid before tracking (the first N are marked cleared). */
  chequesPaid?: number;
};
export type DepositInput = Owner & {
  name: string; amount: number; currency?: string; contractId?: string | null; paidDate?: string | null; refundedDate?: string | null; notes?: string;
};

async function checkOwner(workspaceId: string, o: Owner) {
  if (o.type === 'personal') await assertMember(workspaceId, o.ownerId, 'ownerId');
}

const serializeContract = (c: any) => ({
  id: String(c._id), name: c.name, type: c.type, ownerId: c.ownerId ? String(c.ownerId) : null,
  startDate: c.startDate, endDate: contractEnd(c.startDate, c.months), months: c.months, totalAmount: c.totalAmount,
  monthly: monthlyAmount(c.totalAmount, c.months),
  commitmentId: c.commitmentId ? String(c.commitmentId) : null, accountId: c.accountId ? String(c.accountId) : null,
  cheques: (c.cheques ?? []).map((q: any) => ({ id: String(q._id), date: q.date, amount: q.amount, cleared: !!q.cleared, clearedDate: q.clearedDate ?? null })),
  renewedFrom: c.renewedFrom ? String(c.renewedFrom) : null, notes: c.notes ?? '', status: c.status,
});
const serializeDeposit = (d: any) => ({
  id: String(d._id), name: d.name, amount: d.amount, currency: d.currency ?? 'AED', type: d.type, ownerId: d.ownerId ? String(d.ownerId) : null,
  contractId: d.contractId ? String(d.contractId) : null, paidDate: d.paidDate ?? null, refundedDate: d.refundedDate ?? null,
  notes: d.notes ?? '', status: d.status,
});

/** Keeps the linked commitment's monthly budget in step with the contract (from its first month). */
async function syncCommitment(workspaceId: string, commitmentId: string | null | undefined, startDate: string, total: number, months: number) {
  if (!commitmentId) return;
  const c = await commitmentRepository.findById(workspaceId, commitmentId);
  if (!c) throw badRequest('Unknown commitment');
  const from = startDate.slice(0, 7) > c.startMonth ? startDate.slice(0, 7) : c.startMonth;
  const monthly = monthlyAmount(total, months);
  if (Math.abs(amountFor(c, from) - monthly) > 0.004) await updateCommitment(workspaceId, commitmentId, { amount: monthly, amountEffectiveFrom: from });
}

export async function listContracts(workspaceId: string) {
  const [contracts, deposits] = await Promise.all([
    Contract.find({ workspaceId, status: 'active' }).sort({ startDate: -1 }).lean(),
    Deposit.find({ workspaceId, status: 'active' }).sort({ createdAt: 1 }).lean(),
  ]);
  return { contracts: contracts.map(serializeContract), deposits: deposits.map(serializeDeposit) };
}

export async function createContract(workspaceId: string, userId: string, input: ContractInput, renewedFrom?: string) {
  await checkOwner(workspaceId, input);
  await assertAccount(workspaceId, input.accountId);
  const cheques = chequeSchedule(input.startDate, input.months, input.totalAmount, input.chequeCount)
    .map((q, i) => ({ ...q, cleared: i < (input.chequesPaid ?? 0) }));
  await syncCommitment(workspaceId, input.commitmentId, input.startDate, input.totalAmount, input.months);
  const doc = await Contract.create({
    workspaceId, name: input.name, type: input.type, ownerId: input.type === 'personal' ? input.ownerId : undefined,
    startDate: input.startDate, months: input.months, totalAmount: round2(input.totalAmount),
    commitmentId: input.commitmentId || undefined, accountId: input.accountId || undefined,
    cheques, renewedFrom, notes: input.notes ?? '', createdBy: userId,
  });
  return serializeContract(doc.toObject());
}

export async function updateContract(workspaceId: string, id: string, input: Partial<ContractInput>) {
  const doc = await Contract.findOne({ _id: id, workspaceId });
  if (!doc) throw notFound('Contract');
  if (input.type) await checkOwner(workspaceId, { type: input.type, ownerId: input.ownerId });
  if (input.accountId !== undefined) await assertAccount(workspaceId, input.accountId);
  for (const k of ['name', 'notes'] as const) if (input[k] !== undefined) doc.set(k, input[k]);
  if (input.type) { doc.type = input.type; doc.set('ownerId', input.type === 'personal' ? input.ownerId : undefined); }
  if (input.accountId !== undefined) doc.set('accountId', input.accountId || undefined);
  if (input.commitmentId !== undefined) doc.set('commitmentId', input.commitmentId || undefined);
  // A new amount, length or cheque count re-plans the cheques that haven't cleared yet.
  const replan = input.totalAmount !== undefined || input.months !== undefined || input.chequeCount !== undefined || input.startDate !== undefined;
  if (replan) {
    if (input.startDate) doc.startDate = input.startDate;
    if (input.months) doc.months = input.months;
    if (input.totalAmount !== undefined) doc.totalAmount = round2(input.totalAmount);
    const count = input.chequeCount ?? doc.cheques.length;
    const cleared = new Map(doc.cheques.filter((q) => q.cleared).map((q) => [q.date, q]));
    doc.set('cheques', chequeSchedule(doc.startDate, doc.months, doc.totalAmount, count).map((q) => {
      const done = cleared.get(q.date);
      return done ? { date: q.date, amount: q.amount, cleared: true, clearedDate: done.clearedDate } : { ...q, cleared: false };
    }));
    await syncCommitment(workspaceId, doc.commitmentId ? String(doc.commitmentId) : null, doc.startDate, doc.totalAmount, doc.months);
  }
  await doc.save();
  return serializeContract(doc.toObject());
}

/** Marks a cheque as cleared (it leaves the account on `clearedDate`) or back to not cleared. */
export async function setCheque(workspaceId: string, id: string, chequeId: string, input: { cleared: boolean; clearedDate?: string | null }) {
  const doc = await Contract.findOne({ _id: id, workspaceId });
  if (!doc) throw notFound('Contract');
  const q = doc.cheques.find((x) => String(x._id) === chequeId);
  if (!q) throw notFound('Cheque');
  q.cleared = input.cleared;
  q.set('clearedDate', input.cleared && input.clearedDate ? input.clearedDate : undefined);
  await doc.save();
  return serializeContract(doc.toObject());
}

/** Next year's contract: same bill and account, new rent and cheque count, starting the day after this one ends. */
export async function renewContract(
  workspaceId: string, userId: string, id: string,
  input: { totalAmount: number; chequeCount: number; months?: number; startDate?: string },
) {
  const old = await Contract.findOne({ _id: id, workspaceId }).lean();
  if (!old) throw notFound('Contract');
  const months = input.months ?? old.months;
  return createContract(workspaceId, userId, {
    name: old.name, type: old.type as 'personal' | 'common', ownerId: old.ownerId ? String(old.ownerId) : null,
    startDate: input.startDate ?? addMonthsToDate(old.startDate, old.months), months, totalAmount: input.totalAmount, chequeCount: input.chequeCount,
    commitmentId: old.commitmentId ? String(old.commitmentId) : null, accountId: old.accountId ? String(old.accountId) : null, notes: old.notes ?? '',
  }, String(old._id));
}

export async function archiveContract(workspaceId: string, id: string) {
  const doc = await Contract.findOneAndUpdate({ _id: id, workspaceId }, { $set: { status: 'archived' } }, { new: true });
  if (!doc) throw notFound('Contract');
  return { id, archived: true };
}

export async function createDeposit(workspaceId: string, userId: string, input: DepositInput) {
  await checkOwner(workspaceId, input);
  const doc = await Deposit.create({
    workspaceId, name: input.name, amount: round2(input.amount), currency: input.currency ?? 'AED', type: input.type, ownerId: input.type === 'personal' ? input.ownerId : undefined,
    contractId: input.contractId || undefined, paidDate: input.paidDate || undefined, refundedDate: input.refundedDate || undefined,
    notes: input.notes ?? '', createdBy: userId,
  });
  return serializeDeposit(doc.toObject());
}

export async function updateDeposit(workspaceId: string, id: string, input: Partial<DepositInput> & { archived?: boolean }) {
  const doc = await Deposit.findOne({ _id: id, workspaceId });
  if (!doc) throw notFound('Deposit');
  if (input.type) { await checkOwner(workspaceId, { type: input.type, ownerId: input.ownerId }); doc.type = input.type; doc.set('ownerId', input.type === 'personal' ? input.ownerId : undefined); }
  if (input.name !== undefined) doc.name = input.name;
  if (input.amount !== undefined) doc.amount = round2(input.amount);
  if (input.notes !== undefined) doc.notes = input.notes;
  if (input.currency) doc.currency = input.currency;
  for (const k of ['contractId', 'paidDate', 'refundedDate'] as const) if (input[k] !== undefined) doc.set(k, input[k] || undefined);
  if (input.archived !== undefined) doc.status = input.archived ? 'archived' : 'active';
  await doc.save();
  return serializeDeposit(doc.toObject());
}

/** Commitments paid by contract cheques: their monthly bill records the cost, the cheques move the money. */
export async function chequeCommitmentIds(workspaceId: string) {
  const list = await Contract.find({ workspaceId, status: 'active', commitmentId: { $exists: true } }, { commitmentId: 1 }).lean();
  return new Set(list.map((c) => String(c.commitmentId)));
}
