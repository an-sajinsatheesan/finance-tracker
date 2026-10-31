/**
 * Demo / test data: a couple living in the UAE with Indian bank accounts,
 * using the app for the last 5 months (4 full months + the current one).
 * It goes through the real services, so every row passes the same rules as the UI.
 *
 * Creates its OWN workspace and two demo users; no other workspace is touched.
 *
 *   npm run seed:demo            # create (refuses if the demo workspace exists)
 *   npm run seed:demo -- --reset # delete the demo workspace first, then create it again
 *
 * Sign in as either demo user below. Password: DEMO_PASSWORD env var, default "Demo@12345".
 *
 * Scenarios covered
 * - Accounts: UAE — Rahul: ENBD salary account, ENBD + Mashreq credit cards; Meera: ADCB salary account,
 *   ADCB credit card. India — Rahul: SBI + Federal; Meera: HDFC + ICICI. Opening balances one month before start.
 * - Income: Rahul's salary is paid on the 27th for the next month ("end of previous month");
 *   Meera's on the 28th of the same month. Freelance (received, and partial), a one-off bonus.
 * - Commitments: rent, utilities with amount changes, internet, EMI, phones, subscription, family support,
 *   chitti starting later, a gym that ended, an insurance renewal scheduled in the future;
 *   most paid each month, two left unpaid this month (overdue reminders).
 * - Expenses: groceries, dining, fuel, shopping, medical, travel, a custom category, one paid by Rahul
 *   for Meera, cash spends not linked to an account, one archived duplicate.
 * - Transfers: credit-card bill payments every month, AED → INR remittances with rate and fee.
 * - Recorded balances that differ from the calculation (cash withdrawals, interest, family spending in India).
 * - Goals: emergency fund (common), a trip that completes, a car down payment, gold without a target.
 */
import { Types } from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import {
  Account, AccountBalance, Backup, Commitment, Expense, Goal, GoalAllocation, Income, IncomeMonth, Invitation, Lookup,
  Transfer, User, Workspace,
} from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';
import { seed } from './seed.js';
import { addMonths, currentMonth, dateInMonth, today } from '../utils/month.js';
import { round2 } from '../utils/money.js';
import { completeSetup, ensureMonthIncome, updateWorkspace } from '../services/workspace.service.js';
import { createAccount, createTransfer, getBalances, saveBalances } from '../services/account.service.js';
import { createIncome, updateIncome } from '../services/income.service.js';
import { createCommitment, endCommitment, payCommitment, updateCommitment } from '../services/commitment.service.js';
import { createExpense, setExpenseArchived } from '../services/expense.service.js';
import { createAllocation, createGoal } from '../services/goal.service.js';

const HUSBAND = { email: 'rahul.demo@example.test', name: 'Rahul', relationship: 'Husband' };
const WIFE = { email: 'meera.demo@example.test', name: 'Meera', relationship: 'Wife' };
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';
const MONTHS = 5;

/** Deterministic "random" so every run produces the same data. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const rand = rng(20260601);
const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

async function removeDemo(log: (s: string) => void) {
  const users = await User.find({ email: { $in: [HUSBAND.email, WIFE.email] } }).lean();
  const wsIds = [...new Set(users.map((u) => String(u.workspaceId)))];
  for (const wsId of wsIds) {
    const ws = await Workspace.findById(wsId).lean();
    // Only ever remove a workspace whose members are exactly the demo users.
    const memberEmails = (await User.find({ workspaceId: wsId }).lean()).map((u) => u.email);
    if (memberEmails.some((e) => e !== HUSBAND.email && e !== WIFE.email)) {
      throw new Error(`Workspace "${ws?.name}" has non-demo members; not deleting it.`);
    }
    for (const m of [Account, AccountBalance, Transfer, Income, IncomeMonth, Commitment, Expense, Goal, GoalAllocation, Invitation, Backup]) {
      await (m as typeof Account).deleteMany({ workspaceId: wsId });
    }
    await Lookup.deleteMany({ workspaceId: wsId });
    await User.deleteMany({ workspaceId: wsId });
    await Workspace.deleteOne({ _id: wsId });
    log(`Removed demo workspace "${ws?.name ?? wsId}".`);
  }
}

export async function seedDemo(opts: { reset?: boolean; log?: (s: string) => void } = {}) {
  const log = opts.log ?? console.log;
  await seed({ log });
  if (await User.exists({ email: { $in: [HUSBAND.email, WIFE.email] } })) {
    if (!opts.reset) throw new Error('Demo data already exists. Run with --reset to recreate it.');
    await removeDemo(log);
  }

  const now = currentMonth();
  const todayDay = Number(today().slice(8, 10));
  const start = addMonths(now, -(MONTHS - 1));
  const months = Array.from({ length: MONTHS }, (_, i) => addMonths(start, i));
  const opening = addMonths(start, -1);
  /** Date in a month, or null when that day hasn't come yet this month. */
  const on = (m: string, day: number) => (m === now && day > todayDay ? null : dateInMonth(m, day));

  // ---------- Workspace & users ----------
  const wsId = new Types.ObjectId();
  const hId = new Types.ObjectId();
  const wId = new Types.ObjectId();
  const hash = await hashPassword(PASSWORD);
  await Workspace.create({
    _id: wsId, name: 'Rahul & Meera (demo)', mode: 'couple', currency: 'AED', fxRates: { INR: 23.6 }, startMonth: start,
    setupCompleted: false,
    members: [
      { userId: hId, displayName: HUSBAND.name, relationship: HUSBAND.relationship, incomeSources: [] },
      { userId: wId, displayName: WIFE.name, relationship: WIFE.relationship, incomeSources: [] },
    ],
  });
  await User.insertMany([
    { _id: hId, username: HUSBAND.email, email: HUSBAND.email, passwordHash: hash, displayName: HUSBAND.name, relationship: HUSBAND.relationship, workspaceId: wsId, status: 'active' },
    { _id: wId, username: WIFE.email, email: WIFE.email, passwordHash: hash, displayName: WIFE.name, relationship: WIFE.relationship, workspaceId: wsId, status: 'active' },
  ]);
  const ws = String(wsId);
  const H = String(hId);
  const W = String(wId);

  // ---------- Accounts (opened the month before tracking starts, with opening balances) ----------
  const acc = async (name: string, bank: string, currency: string, accountType: string, ownerId: string, last4: string, openingBalance: number) =>
    (await createAccount(ws, H, { name, bank, currency, accountType, type: 'personal', ownerId, accountNumberLast4: last4, openedMonth: opening, openingBalance })).id;
  const A = {
    enbd: await acc('ENBD Salary', 'ENBD', 'AED', 'current', H, '4521', 14200),
    enbdCard: await acc('ENBD Visa Platinum', 'ENBD', 'AED', 'credit_card', H, '8812', 2350),
    mashreqCard: await acc('Mashreq Cashback Card', 'MASHREQ', 'AED', 'credit_card', H, '3307', 860),
    adcb: await acc('ADCB Salary', 'ADCB', 'AED', 'current', W, '7790', 9800),
    adcbCard: await acc('ADCB TouchPoints Card', 'ADCB', 'AED', 'credit_card', W, '1146', 1240),
    sbi: await acc('SBI NRE Savings', 'SBI', 'INR', 'savings', H, '0921', 185000),
    federal: await acc('Federal NRO Savings', 'FEDERAL', 'INR', 'savings', H, '5534', 62000),
    hdfc: await acc('HDFC NRE Savings', 'HDFC', 'INR', 'savings', W, '2210', 140000),
    icici: await acc('ICICI Savings', 'ICICI', 'INR', 'savings', W, '6683', 48500),
  };
  const cards = new Set([A.enbdCard, A.mashreqCard, A.adcbCard]);
  log('Accounts created (5 UAE, 4 India).');

  // ---------- Recurring income & setup ----------
  await updateWorkspace(ws, {
    members: [
      { userId: H, displayName: HUSBAND.name, relationship: HUSBAND.relationship, incomeSources: [
        { source: 'Salary', amount: 18000, expectedDay: 27, paidPreviousMonth: true, active: true, accountId: A.enbd } as never,
      ] },
      { userId: W, displayName: WIFE.name, relationship: WIFE.relationship, incomeSources: [
        { source: 'Salary', amount: 12000, expectedDay: 28, paidPreviousMonth: false, active: true, accountId: A.adcb } as never,
      ] },
    ],
  });
  await completeSetup(ws, start);

  // ---------- Commitments ----------
  const commit = async (title: string, category: string, type: 'personal' | 'common', ownerId: string | null, amount: number, dueDay: number, extra: { startMonth?: string; endMonth?: string | null; customCategory?: string } = {}) =>
    (await createCommitment(ws, H, {
      title, category, customCategory: extra.customCategory ?? '', type, ownerId, amount, startMonth: extra.startMonth ?? start,
      endMonth: extra.endMonth ?? null, dueDay, notes: '', reminderDaysBefore: 3,
    })).id;
  const C = {
    rent: await commit('Apartment rent', 'Rent', 'common', null, 7500, 1),
    dewa: await commit('DEWA', 'DEWA/Utilities', 'common', null, 650, 10),
    internet: await commit('du Home Internet', 'Internet', 'common', null, 389, 15),
    emi: await commit('Car loan EMI', 'Car Loan', 'personal', H, 2100, 5, { endMonth: addMonths(now, 19) }),
    rahulPhone: await commit('Rahul mobile (Etisalat)', 'Mobile', 'personal', H, 150, 20),
    meeraPhone: await commit('Meera mobile (du)', 'Mobile', 'personal', W, 125, 22),
    netflix: await commit('Netflix', 'Subscription', 'common', null, 56, 25),
    amma: await commit('Amma monthly support', 'Family Support', 'personal', H, 1000, 7),
    chitti: await commit('KSFE Chitti', 'Chitti', 'personal', W, 500, 12, { startMonth: addMonths(start, 1) }),
    gym: await commit('Gym membership', 'Custom', 'personal', W, 300, 3, { customCategory: 'Fitness' }),
    insurance: await commit('Car insurance renewal', 'Insurance', 'personal', H, 2400, 15, { startMonth: addMonths(now, 2), endMonth: addMonths(now, 2) }),
  };
  // Summer AC bill goes up, then comes down again; the gym stops after 3 months.
  await updateCommitment(ws, C.dewa, { amount: 980, amountEffectiveFrom: addMonths(start, 2) });
  await updateCommitment(ws, C.dewa, { amount: 720, amountEffectiveFrom: addMonths(start, 4) });
  await endCommitment(ws, C.gym, addMonths(start, 2));
  log('Commitments created.');

  // ---------- Helpers that also track card spending (cards are paid off next month) ----------
  const cardSpend = new Map<string, number>(); // `${card}|${month}`
  const track = (accountId: string | null | undefined, month: string, amount: number) => {
    if (!accountId || !cards.has(accountId)) return;
    const k = `${accountId}|${month}`;
    cardSpend.set(k, round2((cardSpend.get(k) ?? 0) + amount));
  };
  const spend = async (day: number, m: string, e: {
    description: string; category: string; amount: number; paidBy: string; type: 'personal' | 'common';
    ownerId?: string | null; accountId?: string | null; customCategory?: string; notes?: string;
  }) => {
    const date = on(m, day);
    if (!date) return null;
    const doc = await createExpense(ws, e.paidBy, {
      date, description: e.description, category: e.category, customCategory: e.customCategory ?? '', amount: e.amount,
      paidBy: e.paidBy, type: e.type, ownerId: e.type === 'personal' ? e.ownerId ?? e.paidBy : null, notes: e.notes ?? '', accountId: e.accountId ?? null,
    });
    track(e.accountId, m, e.amount);
    return doc;
  };
  const pay = async (id: string, m: string, day: number, paidBy: string, accountId: string | null) => {
    const date = on(m, day);
    if (!date) return;
    const doc = await payCommitment(ws, paidBy, id, { month: m, date, paidBy, accountId });
    track(accountId, m, doc.amount);
  };

  // ---------- Month by month ----------
  const shops = ['Carrefour', 'Lulu Hypermarket', 'Spinneys', 'Union Coop', 'Choithrams'];
  const food = ['Talabat order', 'Saravana Bhavan', 'Dinner at Logma', 'Zomato order', 'Brunch at Wild & The Moon'];
  const goals = {
    emergency: String((await createGoal(ws, { name: 'Emergency fund', targetAmount: 30000, type: 'common', notes: '6 months of rent' }))._id),
    trip: String((await createGoal(ws, { name: 'Kerala trip', targetAmount: 6000, type: 'common', notes: 'Flights + stay' }))._id),
    car: String((await createGoal(ws, { name: 'New car down payment', targetAmount: 25000, type: 'personal', ownerId: H, notes: '' }))._id),
    gold: String((await createGoal(ws, { name: 'Gold savings', targetAmount: 0, type: 'personal', ownerId: W, notes: 'No target' }))._id),
  };

  for (const [i, m] of months.entries()) {
    const prev = addMonths(m, -1);
    const isNow = m === now;

    // Credit-card bills for last month's spending (the first month pays the opening balance).
    const due = (card: string, openingOwed: number) => (i === 0 ? openingOwed : cardSpend.get(`${card}|${prev}`) ?? 0);
    for (const [card, from, day, owed] of [[A.enbdCard, A.enbd, 12, 2350], [A.mashreqCard, A.enbd, 14, 860], [A.adcbCard, A.adcb, 12, 1240]] as const) {
      const amount = due(card, owed);
      const date = on(m, day);
      if (amount > 0 && date) await createTransfer(ws, H, { date, fromAccountId: from, toAccountId: card, amount, note: 'Card bill payment' });
    }

    // Remittances to India (rate moves a little each month, AED 15 fee).
    const rate = round2(23.4 + rand() * 0.4);
    const remit = async (day: number, from: string, to: string, aed: number, note: string) => {
      const date = on(m, day);
      if (date) await createTransfer(ws, H, { date, fromAccountId: from, toAccountId: to, amount: aed, toAmount: round2(aed * rate), fee: 15, note });
    };
    await remit(4, A.enbd, A.sbi, 3000, 'Monthly savings to SBI');
    if (i % 2 === 1) await remit(6, A.enbd, A.federal, 1000, 'Home renovation fund');
    await remit(3, A.adcb, A.hdfc, 2000, 'Monthly savings to HDFC');
    if (i === 2) await remit(9, A.adcb, A.icici, 1500, 'Parents medical');

    // Commitments.
    await pay(C.rent, m, 1, H, A.enbd);
    await pay(C.emi, m, 5, H, A.enbd);
    await pay(C.amma, m, 7, H, A.enbd);
    await pay(C.dewa, m, 10, W, A.adcbCard);
    await pay(C.internet, m, 15, H, A.enbdCard);
    await pay(C.rahulPhone, m, 20, H, A.mashreqCard);
    if (i >= 1) await pay(C.chitti, m, 12, W, A.adcb);
    if (i <= 2) await pay(C.gym, m, 3, W, A.adcbCard);
    if (!isNow) { // left unpaid this month → overdue reminders
      await pay(C.meeraPhone, m, 22, W, A.adcbCard);
      await pay(C.netflix, m, 25, H, A.enbdCard);
    }

    // Day-to-day spending.
    for (const day of [3, 10, 17, 24]) {
      const paidBy = day % 2 ? H : W;
      await spend(day, m, { description: pick(shops), category: 'Grocery', amount: between(180, 620), paidBy, type: 'common', accountId: paidBy === H ? A.enbdCard : A.adcbCard });
    }
    for (const day of [8, 21]) {
      await spend(day, m, { description: pick(food), category: 'Dining', amount: between(110, 380), paidBy: day === 8 ? H : W, type: 'common', accountId: day === 8 ? A.enbdCard : A.adcbCard });
    }
    for (const day of [6, 16, 26]) {
      await spend(day, m, { description: pick(['ENOC', 'ADNOC', 'Emarat']), category: 'Fuel', amount: between(140, 210), paidBy: H, type: 'personal', accountId: A.mashreqCard });
    }
    await spend(13, m, { description: pick(['Namshi', 'Centrepoint', 'Max Fashion', 'Sephora']), category: 'Shopping', amount: between(150, 900), paidBy: W, type: 'personal', accountId: A.adcbCard });
    await spend(19, m, { description: pick(['Amazon.ae', 'Noon', 'Sharaf DG']), category: 'Shopping', amount: between(90, 650), paidBy: H, type: 'personal', accountId: A.enbdCard });
    // Cash, not linked to any account (shows the "not linked" warning on Balances).
    await spend(11, m, { description: 'Laundry (cash)', category: 'Custom', customCategory: 'Household services', amount: between(60, 95), paidBy: W, type: 'common', accountId: null });

    // One-off scenarios.
    if (i === 1) await spend(9, m, { description: 'Aster clinic visit', category: 'Medical', amount: 350, paidBy: W, type: 'personal', accountId: A.adcb });
    if (i === 2) await spend(2, m, { description: 'Air India Express DXB–COK return', category: 'Travel', amount: 3850, paidBy: H, type: 'common', accountId: A.mashreqCard, notes: 'Kerala trip' });
    if (i === 3) {
      await spend(18, m, { description: 'Car service — 40,000 km', category: 'Custom', customCategory: 'Car maintenance', amount: 680, paidBy: H, type: 'personal', accountId: A.enbd });
      const dup = await spend(17, m, { description: 'Carrefour (entered twice)', category: 'Grocery', amount: 245, paidBy: H, type: 'common', accountId: null });
      if (dup) await setExpenseArchived(ws, H, String(dup._id), true);
    }
    if (isNow) {
      await spend(2, m, { description: 'Salon — birthday treat for Meera', category: 'Shopping', amount: 420, paidBy: H, type: 'personal', ownerId: W, accountId: A.enbdCard });
      await spend(9, m, { description: 'Tailor (cash)', category: 'Shopping', amount: 120, paidBy: W, type: 'personal', accountId: null });
    }

    // Goal allocations.
    const goalDay = on(m, 28) ?? on(m, todayDay);
    if (goalDay && !isNow) {
      await createAllocation(ws, goals.emergency, { userId: H, date: goalDay, amount: 1500, note: '' });
      await createAllocation(ws, goals.emergency, { userId: W, date: goalDay, amount: 1000, note: '' });
      if (i === 0) await createAllocation(ws, goals.trip, { userId: H, date: goalDay, amount: 3000, note: '' });
      if (i === 1) await createAllocation(ws, goals.trip, { userId: W, date: goalDay, amount: 3000, note: 'Trip fully funded' });
      if (i >= 1) await createAllocation(ws, goals.car, { userId: H, date: goalDay, amount: 2000, note: '' });
      if (i === 3) await createAllocation(ws, goals.gold, { userId: W, date: goalDay, amount: 1500, note: '22k coin' });
    }
  }
  log('Expenses, commitment payments, transfers and goal allocations recorded.');

  // ---------- Income received ----------
  for (const m of [...months, addMonths(now, 1)]) await ensureMonthIncome(ws, m);
  const rows = await Income.find({ workspaceId: wsId }).lean();
  for (const r of rows) {
    if (!r.expectedDate || r.expectedDate > today()) continue; // not paid yet
    await updateIncome(ws, String(r._id), { receivedAmount: r.expectedAmount, receivedDate: r.expectedDate });
  }
  const inc = async (userId: string, m: string, source: string, expected: number, received: number, day: number, accountId: string, notes: string) => {
    const date = on(m, day);
    await createIncome(ws, {
      userId, month: m, source, expectedAmount: expected, receivedAmount: date ? received : 0,
      expectedDate: dateInMonth(m, day), receivedDate: date && received ? date : '', notes, accountId,
    });
  };
  await inc(H, months[1], 'Freelance', 2500, 2500, 18, A.enbd, 'Website project');
  await inc(W, months[3], 'Bonus', 4000, 4000, 25, A.adcb, 'Mid-year bonus');
  await inc(H, now, 'Freelance', 1800, 1000, Math.min(todayDay, 14), A.enbd, 'Logo design — rest due next month');
  log('Income generated and marked received.');

  // ---------- Recorded balances that don't match the calculation ----------
  const closing = async (m: string, accountId: string) => (await getBalances(ws, m)).accounts.find((a) => a.id === accountId)!.closing;
  const record = async (m: string, accountId: string, delta: number, note: string) =>
    saveBalances(ws, H, m, [{ accountId, balance: round2((await closing(m, accountId)) + delta), note }]);
  await record(months[2], A.enbd, -420, 'ATM cash withdrawals not entered');
  await record(months[3], A.sbi, 612, 'Quarterly interest');
  await record(months[3], A.hdfc, 540, 'Quarterly interest');
  await record(now, A.sbi, -8000, 'Cash for family in Kerala');
  log('Recorded balances saved.');

  log('');
  log(`Demo workspace ready in database "${env.mongoDb}" (${start} to ${now}).`);
  log(`Sign in as ${HUSBAND.email} or ${WIFE.email} (password: DEMO_PASSWORD, default in src/scripts/seed-demo.ts).`);
}

// Run only when executed directly.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seed-demo.ts')) {
  connectDB()
    .then(() => seedDemo({ reset: process.argv.includes('--reset') }))
    .then(() => disconnectDB())
    .catch(async (err) => {
      console.error('Demo seed failed:', err.message);
      await disconnectDB().catch(() => undefined);
      process.exit(1);
    });
}
