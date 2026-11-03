import { badRequest, notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { today } from '../utils/month.js';
import { Account, AccountBalance, LoanEntry } from '../models/index.js';
import { ledger, monthEnds, summary, type LoanKind } from './loan.logic.js';

export type LoanEntryInput = {
  date: string; kind: LoanKind; details?: string; ref?: string; amount?: number; rate?: number | null;
  statementBalance?: number | null; notes?: string;
};
const NOTE = 'From loan statement';

async function loanAccount(workspaceId: string, accountId: string) {
  const a = await Account.findOne({ _id: accountId, workspaceId }).lean();
  if (!a) throw notFound('Account');
  return a;
}

const toLine = (e: any) => ({
  id: String(e._id), date: e.date, kind: e.kind as LoanKind, details: e.details ?? '', ref: e.ref ?? '', amount: e.amount ?? 0,
  rate: e.rate ?? null, statementBalance: e.statementBalance ?? null, notes: e.notes ?? '', order: new Date(e.createdAt).getTime(),
});

/**
 * The loan account's month-end balances follow the statement: each month with lines gets
 * its closing outstanding (from the month the account is tracked), so Loans & cards, Wealth
 * and Balances show the same figure.
 */
async function syncBalances(workspaceId: string, accountId: string) {
  const a = await loanAccount(workspaceId, accountId);
  const rows = ledger((await LoanEntry.find({ workspaceId, accountId, status: 'active' }).lean()).map(toLine));
  const ends = monthEnds(rows);
  const months = [...ends.keys()].filter((m) => m >= a.openedMonth);
  await AccountBalance.deleteMany({ workspaceId, accountId, note: NOTE, month: { $nin: months } });
  if (months.length) {
    await AccountBalance.bulkWrite(months.map((m) => ({
      updateOne: {
        filter: { workspaceId, accountId, month: m },
        update: { $set: { balance: ends.get(m)!, opening: false, note: NOTE } },
        upsert: true,
      },
    })));
  }
}

export async function getLoan(workspaceId: string, accountId: string) {
  await loanAccount(workspaceId, accountId);
  const rows = ledger((await LoanEntry.find({ workspaceId, accountId, status: 'active' }).lean()).map(toLine));
  return { entries: rows.map(({ order: _o, ...r }) => r), summary: summary(rows, today()) };
}

function clean(input: LoanEntryInput) {
  if (input.kind === 'rate' && !input.rate) throw badRequest('Enter the new interest rate');
  if (input.kind !== 'rate' && !input.amount) throw badRequest('Enter the amount');
  return {
    date: input.date, kind: input.kind, details: input.details ?? '', ref: input.ref ?? '',
    amount: input.kind === 'rate' ? 0 : input.kind === 'adjustment' ? round2(input.amount ?? 0) : round2(Math.abs(input.amount ?? 0)),
    rate: input.kind === 'rate' ? input.rate : undefined,
    statementBalance: input.statementBalance ?? undefined, notes: input.notes ?? '',
  };
}

export async function addEntries(workspaceId: string, userId: string, accountId: string, list: LoanEntryInput[]) {
  await loanAccount(workspaceId, accountId);
  const docs = list.map(clean).map((e) => ({ ...e, workspaceId, accountId, createdBy: userId }));
  // One by one, so lines on the same date keep the order they were given in.
  for (const d of docs) await LoanEntry.create(d);
  await syncBalances(workspaceId, accountId);
  return getLoan(workspaceId, accountId);
}

export async function updateEntry(workspaceId: string, accountId: string, id: string, input: LoanEntryInput) {
  const doc = await LoanEntry.findOne({ _id: id, workspaceId, accountId, status: 'active' });
  if (!doc) throw notFound('Loan entry');
  const c = clean(input);
  doc.set(c);
  if (c.kind !== 'rate') doc.set('rate', undefined);
  if (input.statementBalance === null) doc.set('statementBalance', undefined);
  await doc.save();
  await syncBalances(workspaceId, accountId);
  return getLoan(workspaceId, accountId);
}

/** Removes a line added by mistake (kept archived, like other records). */
export async function removeEntry(workspaceId: string, accountId: string, id: string) {
  const doc = await LoanEntry.findOneAndUpdate({ _id: id, workspaceId, accountId }, { $set: { status: 'archived' } });
  if (!doc) throw notFound('Loan entry');
  await syncBalances(workspaceId, accountId);
  return getLoan(workspaceId, accountId);
}
