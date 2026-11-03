import type { Types } from 'mongoose';
import { badRequest, notFound } from '../utils/AppError.js';
import { round2 } from '../utils/money.js';
import { addMonths } from '../utils/month.js';
import { ACCOUNT_GROUPS, type AccountGroup } from '../utils/lookups.js';
import { Account, AccountBalance, Contribution, Expense, Income, Lookup, Transfer } from '../models/index.js';
import { assertMember, ensureMonthIncome, getWorkspace } from './workspace.service.js';
import { assertLookup } from './lookup.service.js';
import { balanceAt as latestBalance, computeWealth, type AccountRow, type BalanceRow } from './wealth.logic.js';
import { balanceAt as calculatedBalanceAt, computeBalances, indexFlows } from './balances.logic.js';

type AccountInput = {
  name: string; bank: string; currency: string; accountType: string; type: 'personal' | 'common';
  ownerId?: string | null; accountNumberLast4?: string; openedMonth: string; notes?: string;
  openingBalance?: number | null; openingInvested?: number | null;
};

/** accountType code → group (cash / deposit / investment / liability) from the Lookup table. */
async function groupsByType(workspaceId: string): Promise<Map<string, AccountGroup>> {
  const rows = await Lookup.find({ type: 'accountType', $or: [{ workspaceId: null }, { workspaceId }] }).lean();
  return new Map(rows.map((r) => {
    const g = (r.meta as { group?: string } | undefined)?.group;
    return [r.code, (ACCOUNT_GROUPS as readonly string[]).includes(g ?? '') ? (g as AccountGroup) : 'cash'];
  }));
}

const serialize = (a: any, group: AccountGroup) => ({
  id: String(a._id), name: a.name, bank: a.bank, currency: a.currency, accountType: a.accountType, group,
  type: a.type, ownerId: a.ownerId ? String(a.ownerId) : null, accountNumberLast4: a.accountNumberLast4 ?? '',
  openedMonth: a.openedMonth, notes: a.notes ?? '', archived: !!a.archived,
});

async function validate(workspaceId: string, input: Partial<AccountInput>) {
  await assertLookup(workspaceId, 'bank', input.bank, 'bank');
  await assertLookup(workspaceId, 'currency', input.currency, 'currency');
  await assertLookup(workspaceId, 'accountType', input.accountType, 'account type');
  if (input.type === 'personal') {
    if (!input.ownerId) throw badRequest('Personal accounts need an owner');
    await assertMember(workspaceId, input.ownerId, 'ownerId');
  }
}

/** An income or expense may only point at an account of this workspace. */
export async function assertAccount(workspaceId: string, accountId: string | null | undefined) {
  if (!accountId) return;
  if (!(await Account.exists({ _id: accountId, workspaceId }))) throw badRequest('Unknown account');
}

export async function listAccounts(workspaceId: string, includeArchived = false) {
  const [docs, groups] = await Promise.all([
    Account.find({ workspaceId, ...(includeArchived ? {} : { archived: false }) }).sort({ currency: 1, name: 1 }).lean(),
    groupsByType(workspaceId),
  ]);
  return docs.map((a) => serialize(a, groups.get(a.accountType) ?? 'cash'));
}

export async function createAccount(workspaceId: string, userId: string, input: AccountInput) {
  await validate(workspaceId, input);
  const doc = await Account.create({
    workspaceId, name: input.name, bank: input.bank, currency: input.currency, accountType: input.accountType,
    type: input.type, ownerId: input.type === 'personal' ? input.ownerId : undefined,
    accountNumberLast4: input.accountNumberLast4 ?? '', openedMonth: input.openedMonth, notes: input.notes ?? '', createdBy: userId,
  });
  if (input.openingBalance !== undefined && input.openingBalance !== null) {
    await AccountBalance.create({
      workspaceId, accountId: doc._id, month: input.openedMonth, balance: round2(input.openingBalance),
      invested: input.openingInvested ?? null, opening: true, updatedBy: userId,
    });
  }
  const groups = await groupsByType(workspaceId);
  return serialize(doc.toObject(), groups.get(doc.accountType) ?? 'cash');
}

/**
 * The balance entered when an account is added is stored in its "tracked from"
 * month. When that month is changed, the opening balance moves with it, so
 * the earlier month shows the account's balance. Only done while the opening record
 * is still the first one and the new month comes before any later record.
 */
async function moveOpeningBalance(workspaceId: string, accountId: Types.ObjectId, from: string, to: string) {
  const [first, second] = await AccountBalance.find({ workspaceId, accountId }).sort({ month: 1 }).limit(2);
  if (!first || first.month !== from) return;
  if (second && to >= second.month) return;
  first.month = to;
  await first.save();
}

export async function updateAccount(workspaceId: string, id: string, input: Partial<AccountInput> & { archived?: boolean }) {
  const doc = await Account.findOne({ _id: id, workspaceId });
  if (!doc) throw notFound('Account');
  const merged = {
    bank: input.bank ?? doc.bank, currency: input.currency ?? doc.currency, accountType: input.accountType ?? doc.accountType,
    type: input.type ?? doc.type, ownerId: input.ownerId !== undefined ? input.ownerId : doc.ownerId ? String(doc.ownerId) : null,
  };
  await validate(workspaceId, merged);
  if (input.currency && input.currency !== doc.currency && (await AccountBalance.exists({ accountId: doc._id }))) {
    throw badRequest('Currency cannot change once balances are recorded. Create a new account instead.');
  }
  const oldOpened = doc.openedMonth;
  for (const k of ['name', 'bank', 'currency', 'accountType', 'accountNumberLast4', 'openedMonth', 'notes', 'archived'] as const) {
    if (input[k] !== undefined) doc.set(k, input[k]);
  }
  doc.type = merged.type;
  doc.set('ownerId', merged.type === 'personal' ? merged.ownerId : undefined);
  await doc.save();
  if (doc.openedMonth !== oldOpened) await moveOpeningBalance(workspaceId, doc._id, oldOpened, doc.openedMonth);
  if (input.openingBalance !== undefined) {
    // The balance tracking starts from: later months build on it with the linked money.
    if (input.openingBalance === null) await AccountBalance.deleteOne({ workspaceId, accountId: doc._id, month: doc.openedMonth, opening: true });
    else {
      await AccountBalance.updateOne(
        { workspaceId, accountId: doc._id, month: doc.openedMonth },
        { $set: { balance: round2(input.openingBalance), opening: true } },
        { upsert: true },
      );
    }
  }
  const groups = await groupsByType(workspaceId);
  return serialize(doc.toObject(), groups.get(doc.accountType) ?? 'cash');
}

/**
 * Saves month-end balances for several accounts at once (the "update balances"
 * dialog). `balance: null` removes that month's record so it carries forward again.
 */
export async function saveBalances(
  workspaceId: string, userId: string, month: string,
  items: { accountId: string; balance: number | null; invested?: number | null; note?: string }[],
) {
  const ids = items.map((i) => i.accountId);
  const owned = await Account.find({ workspaceId, _id: { $in: ids } }).select('_id openedMonth').lean();
  if (owned.length !== new Set(ids).size) throw badRequest('Unknown account');
  for (const i of items) {
    const a = owned.find((o) => String(o._id) === i.accountId)!;
    if (month < a.openedMonth) throw badRequest(`Balance month is before the account was opened (${a.openedMonth})`);
    if (i.balance === null) {
      await AccountBalance.deleteOne({ workspaceId, accountId: i.accountId, month });
      continue;
    }
    await AccountBalance.updateOne(
      { workspaceId, accountId: i.accountId, month },
      { $set: { balance: round2(i.balance), invested: i.invested ?? null, note: i.note ?? '', opening: false, updatedBy: userId } },
      { upsert: true },
    );
  }
  return { saved: items.length };
}

export async function balanceHistory(workspaceId: string, accountId: string) {
  return AccountBalance.find({ workspaceId, accountId }).sort({ month: -1 }).lean();
}

// ---------- Transfers ----------

export async function listTransfers(workspaceId: string, month: string) {
  return Transfer.find({ workspaceId, month, status: 'active' }).sort({ date: -1, createdAt: -1 }).lean();
}

export async function createTransfer(
  workspaceId: string, userId: string,
  input: { date: string; fromAccountId: string; toAccountId: string; amount: number; toAmount?: number | null; fee?: number; note?: string },
) {
  if (input.fromAccountId === input.toAccountId) throw badRequest('Choose two different accounts');
  const [from, to] = await Promise.all([
    Account.findOne({ _id: input.fromAccountId, workspaceId }).lean(),
    Account.findOne({ _id: input.toAccountId, workspaceId }).lean(),
  ]);
  if (!from || !to) throw badRequest('Unknown account');
  const toAmount = input.toAmount ?? (from.currency === to.currency ? input.amount : null);
  if (!toAmount) throw badRequest(`Enter the amount received in ${to.currency}`);
  return Transfer.create({
    workspaceId, date: input.date, month: input.date.slice(0, 7), fromAccountId: from._id, toAccountId: to._id,
    amount: round2(input.amount), toAmount: round2(toAmount), fee: round2(input.fee ?? 0), note: input.note ?? '', createdBy: userId,
  });
}

export async function archiveTransfer(workspaceId: string, id: string) {
  const doc = await Transfer.findOne({ _id: id, workspaceId });
  if (!doc) throw notFound('Transfer');
  doc.status = 'archived';
  await doc.save();
  return { id, archived: true };
}

// ---------- Wealth ----------

const TREND_MONTHS = 12;

/** scope: 'all' (household), 'common' (joint accounts) or a member id (their own accounts). */
export async function getWealth(workspaceId: string, month: string, scope = 'all') {
  const ws = await getWorkspace(workspaceId);
  if (scope !== 'all' && scope !== 'common') await assertMember(workspaceId, scope, 'scope');
  const all = await listAccounts(workspaceId);
  const accounts = all.filter((a) =>
    scope === 'all' ? true : scope === 'common' ? a.type === 'common' : a.ownerId === scope,
  );
  const ids = accounts.map((a) => a.id);
  const first = addMonths(month, -TREND_MONTHS);
  const [balances, transfers, linkedMoney] = await Promise.all([
    AccountBalance.find({ workspaceId, accountId: { $in: ids }, month: { $lte: month } }).lean(),
    Transfer.find({ workspaceId, status: 'active', month: { $gt: first, $lte: month } }).lean(),
    loadLinkedMoney(workspaceId, all.map((a) => a.id), month), // transfers to accounts outside the scope still move these balances
  ]);
  const idSet = new Set(ids);
  const fx = ws.fxRates instanceof Map ? Object.fromEntries(ws.fxRates) : { ...(ws.fxRates ?? {}) };
  const opened = new Map(all.map((a) => [a.id, a.openedMonth]));
  const recorded: BalanceRow[] = balances.map((b) => ({
    accountId: String(b.accountId), month: b.month, balance: b.balance, invested: b.invested, opening: isOpeningBalance(b, opened.get(String(b.accountId))),
  }));
  const calculated = calculatedMonths(accounts as AccountRow[], recorded, linkedMoney, month);
  const replaced = new Set(calculated.map((c) => `${c.accountId}|${c.month}`)); // opening months get their calculated end-of-month value
  return computeWealth({
    accounts: accounts as AccountRow[],
    balances: [...recorded.filter((r) => !replaced.has(`${r.accountId}|${r.month}`)), ...calculated],
    transfers: transfers
      .filter((t) => idSet.has(String(t.fromAccountId)) && idSet.has(String(t.toAccountId)))
      .map((t) => ({ month: t.month, date: t.date, fromAccountId: String(t.fromAccountId), toAccountId: String(t.toAccountId), amount: t.amount, toAmount: t.toAmount, fee: t.fee })),
    month, base: ws.currency ?? 'AED', fx: fx as Record<string, number>, trendMonths: TREND_MONTHS,
  });
}

// ---------- Calculated balances & savings ----------

/** Rows saved before `opening` existed: the balance in the account's first month is the one entered when it was added. */
const isOpeningBalance = (b: { opening?: boolean | null; month: string }, openedMonth?: string) => b.opening ?? b.month === openedMonth;

/** Income, expenses and transfers linked to the workspace's accounts, up to the end of `month`. */
async function loadLinkedMoney(workspaceId: string, accountIds: string[], month: string) {
  // Income for next month's budget can already be in the bank (paid at the end of this month),
  // and next month's bills can already be paid.
  const [incomes, expenses, transfers, contributions] = await Promise.all([
    Income.find({ workspaceId, month: { $lte: addMonths(month, 1) }, status: { $ne: 'archived' } }).lean(),
    Expense.find({ workspaceId, month: { $lte: addMonths(month, 1) }, status: 'active' }).lean(),
    Transfer.find({ workspaceId, status: 'active', month: { $lte: month } }).lean(),
    Contribution.find({ workspaceId, status: 'active', date: { $lte: `${month}-31` } }).lean(),
  ]);
  const idSet = new Set(accountIds);
  const linked = (id: unknown) => (id && idSet.has(String(id)) ? String(id) : null);
  return {
    incomes: incomes.map((i) => ({
      userId: String(i.userId), month: i.month, receivedDate: i.receivedDate ?? null, receivedAmount: i.receivedAmount ?? 0,
      status: i.status, accountId: linked(i.accountId),
    })),
    expenses: expenses.map((e) => ({
      month: e.month, date: e.date, amount: e.amount, accountId: linked(e.accountId), paidOut: e.paidOut, paidOutDate: e.paidOutDate,
      shares: e.shares.map((s) => ({ userId: String(s.userId), amount: s.amount })),
    })),
    transfers: transfers
      .filter((t) => idSet.has(String(t.fromAccountId)) && idSet.has(String(t.toAccountId)))
      .map((t) => ({ month: t.month, fromAccountId: String(t.fromAccountId), toAccountId: String(t.toAccountId), amount: t.amount, toAmount: t.toAmount, fee: t.fee ?? 0 }))
      // A partner's share of a bill sent to the other (or a joint account) moves money on the day it was sent.
      .concat(contributions
        .filter((c) => linked(c.fromAccountId) || linked(c.toAccountId))
        .map((c) => ({ month: c.date.slice(0, 7), fromAccountId: linked(c.fromAccountId) ?? '', toAccountId: linked(c.toAccountId) ?? '', amount: c.amount, toAmount: c.amount, fee: 0 }))),
  };
}

/**
 * For months without an entered balance, the same calculated balance the Balances page shows
 * (last entered balance + linked money in − money out), so Accounts and Wealth agree with it.
 */
function calculatedMonths(accounts: AccountRow[], recorded: BalanceRow[], money: Awaited<ReturnType<typeof loadLinkedMoney>>, month: string): BalanceRow[] {
  const flows = indexFlows(money.incomes, money.expenses, money.transfers);
  const out: BalanceRow[] = [];
  for (const a of accounts) {
    for (let i = 0; i <= TREND_MONTHS; i++) {
      const m = addMonths(month, -i);
      if (recorded.some((r) => r.accountId === a.id && r.month === m && !r.opening)) continue;
      const calc = calculatedBalanceAt(a, m, recorded, flows);
      const last = latestBalance(recorded, a.id, m);
      if (!calc || (!last && calc.balance === 0)) continue; // nothing entered or linked yet
      out.push({ accountId: a.id, month: m, balance: calc.balance, invested: last?.invested ?? null, calculated: true, opening: last?.month === m && last.opening });
    }
  }
  return out;
}

/** Account balances moved by the income, expenses and transfers linked to them, plus monthly savings per person. */
export async function getBalances(workspaceId: string, month: string) {
  const ws = await getWorkspace(workspaceId);
  await ensureMonthIncome(workspaceId, month);
  const accounts = await listAccounts(workspaceId);
  const ids = accounts.map((a) => a.id);
  const [snapshots, money] = await Promise.all([
    AccountBalance.find({ workspaceId, accountId: { $in: ids }, month: { $lte: month } }).lean(),
    loadLinkedMoney(workspaceId, ids, month),
  ]);
  const fx = ws.fxRates instanceof Map ? Object.fromEntries(ws.fxRates) : { ...(ws.fxRates ?? {}) };
  const opened = new Map(accounts.map((a) => [a.id, a.openedMonth]));
  return computeBalances({
    accounts: accounts as AccountRow[],
    snapshots: snapshots.map((s) => ({
      accountId: String(s.accountId), month: s.month, balance: s.balance, opening: isOpeningBalance(s, opened.get(String(s.accountId))),
    })),
    ...money,
    memberIds: ws.members.map((m) => String(m.userId)),
    month,
    startMonth: ws.startMonth,
    base: ws.currency ?? 'AED',
    fx: fx as Record<string, number>,
  });
}
