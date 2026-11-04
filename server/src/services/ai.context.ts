import { Workspace } from '../models/index.js';
import { notFound } from '../utils/AppError.js';
import { getSummary } from './summary.service.js';
import { getWealth } from './account.service.js';
import { listGoals } from './goal.service.js';
import { getLoan } from './loan.service.js';

/**
 * The compact picture of one workspace that is sent to the AI with each question. Only names and
 * amounts: no emails, sign-in details, account numbers or free-text notes leave the app.
 */
export async function getAiContext(workspaceId: string, month: string, day: string) {
  const ws = await Workspace.findById(workspaceId).lean();
  if (!ws) throw notFound('Workspace');
  const name = new Map(ws.members.map((m) => [String(m.userId), m.displayName]));
  const who = (id?: unknown) => (id ? name.get(String(id)) ?? null : 'shared');

  const scopes = [...ws.members.map((m) => String(m.userId)), ...(ws.members.length > 1 ? ['common'] : [])];
  const [summaries, wealth, goals] = await Promise.all([
    Promise.all(scopes.map((s) => getSummary(workspaceId, month, s))),
    getWealth(workspaceId, month, 'all'),
    listGoals(workspaceId),
  ]);

  // Interest rate and usual payment of each loan, from its statement lines (when they've been entered).
  const debts = wealth.accounts.filter((a) => a.group === 'liability');
  const statements = await Promise.all(debts.map((a) => getLoan(workspaceId, a.id)));
  const loans = new Map(debts.map((a, i) => {
    const { rate, lastPayment, interestLastYear } = statements[i].summary;
    return [a.id, statements[i].entries.length ? { rate, lastPayment, interestLastYear } : {}];
  }));

  const picture = (s: (typeof summaries)[number]) => ({
    thisMonth: {
      incomeExpected: s.cards.incomeExpected, incomeReceived: s.cards.incomeReceived, incomePending: s.cards.incomePending,
      personalExpenses: s.cards.personalExpenses, shareOfCommonExpenses: s.cards.commonShare, totalSpent: s.cards.totalOutflow,
      // Named so that nothing gets counted twice: goals come out of cash left, paid bills are already in totalSpent.
      cashLeftBeforeGoals: s.cards.cashLeft, movedToGoals: s.cards.allocatedToGoals, cashLeftAfterGoals: s.cards.notYetAllocated,
      commitmentsStillToPay: s.commitmentsDue.filter((c) => !c.paid).reduce((a, c) => a + c.myShare, 0),
    },
    plannedVsActualByCategory: s.budgetVsActual.filter((c) => c.planned || c.actual),
    last6Months: s.trend.map((t) => ({ month: t.month, income: t.incomeReceived, spent: t.outflow, planned: t.planned })),
  });

  const commitments = new Map(summaries.flatMap((s) => s.commitmentsDue).map((c) => [c.id, c]));
  return {
    today: day,
    baseCurrency: ws.currency,
    exchangeRates: Object.fromEntries(ws.fxRates instanceof Map ? ws.fxRates : Object.entries(ws.fxRates ?? {})),
    people: ws.members.map((m, i) => ({
      name: m.displayName,
      relationship: m.relationship,
      monthlySalary: m.incomeSources.filter((s) => s.active !== false).map((s) => ({ source: s.source, amount: s.amount, payDay: s.expectedDay })),
      ...picture(summaries[i]),
    })),
    ...(ws.members.length > 1 && { sharedByTheCouple: picture(summaries[summaries.length - 1]) }),
    monthlyCommitments: [...commitments.values()].map((c) => ({
      title: c.title, category: c.category, owner: c.type === 'common' ? 'shared' : who(c.ownerId), amount: c.amount, dueDay: c.dueDay, paidThisMonth: c.paid,
    })),
    accounts: wealth.accounts.map((a) => ({
      name: a.name, kind: a.group, currency: a.currency, owner: a.type === 'common' ? 'shared' : who(a.ownerId), balance: a.current, invested: a.invested,
      ...loans.get(a.id),
    })),
    netWorth: wealth.combined,
    goals: goals.filter((g) => g.status === 'active').map((g) => ({
      name: g.name, target: g.targetAmount, savedSoFar: g.allocatedTotal, owner: g.type === 'common' ? 'shared' : who(g.ownerId),
    })),
  };
}
