import { notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { incomeRepository } from '../repositories/income.repository.js';
import { assertMember, ensureMonthIncome } from './workspace.service.js';

type IncomeInput = {
  userId?: string;
  month?: string;
  source?: string;
  expectedAmount?: number;
  receivedAmount?: number;
  expectedDate?: string;
  receivedDate?: string;
  status?: 'expected' | 'partial' | 'received';
  notes?: string;
};

/** Status follows the amounts unless set explicitly. */
export function deriveIncomeStatus(expected: number, received: number): 'expected' | 'partial' | 'received' {
  if (received <= 0) return 'expected';
  if (received + 0.001 >= expected) return 'received';
  return 'partial';
}

export async function listIncome(workspaceId: string, month: string) {
  await ensureMonthIncome(workspaceId, month);
  return incomeRepository.listByMonth(workspaceId, month);
}

export async function createIncome(workspaceId: string, input: Required<Pick<IncomeInput, 'userId' | 'month' | 'source' | 'expectedAmount'>> & IncomeInput) {
  await assertMember(workspaceId, input.userId, 'userId');
  const received = round2(input.receivedAmount ?? 0);
  return incomeRepository.create({
    workspaceId,
    userId: input.userId,
    month: input.month,
    source: input.source,
    expectedAmount: round2(input.expectedAmount),
    receivedAmount: received,
    expectedDate: input.expectedDate || undefined,
    receivedDate: input.receivedDate || undefined,
    status: input.status ?? deriveIncomeStatus(input.expectedAmount, received),
    notes: input.notes ?? '',
  });
}

export async function updateIncome(workspaceId: string, id: string, input: IncomeInput) {
  const doc = await incomeRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Income');
  if (input.userId) await assertMember(workspaceId, input.userId, 'userId');
  const { status, ...rest } = input;
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    doc.set(k, typeof v === 'number' ? round2(v) : v === '' && k.endsWith('Date') ? undefined : v);
  }
  if (doc.status !== 'archived') {
    doc.status = status ?? deriveIncomeStatus(doc.expectedAmount, doc.receivedAmount ?? 0);
  }
  await doc.save();
  return doc;
}

export async function setIncomeArchived(workspaceId: string, id: string, archived: boolean) {
  const doc = await incomeRepository.findById(workspaceId, id);
  if (!doc) throw notFound('Income');
  doc.status = archived ? 'archived' : deriveIncomeStatus(doc.expectedAmount, doc.receivedAmount ?? 0);
  await doc.save();
  return doc;
}
