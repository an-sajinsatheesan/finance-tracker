/**
 * End-to-end API test against a real MongoDB-compatible server.
 * Runs only when TEST_MONGODB_URI is set, and only ever uses the `finance_test` database.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

const uri = process.env.TEST_MONGODB_URI;
const d = uri ? describe : describe.skip;

d('API', () => {
  let app: import('express').Express;
  let tokenS = '', tokenA = '', sajinId = '', abhiId = '', inviteToken = '';
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = 'finance_test';
    process.env.JWT_SECRET ??= 'x'.repeat(40);
    // Never send real email from tests. An empty value (not delete) stops .env.local from filling it back in.
    process.env.SMTP_HOST = '';
    process.env.OPENAI_API_KEY = ''; // and never call OpenAI
    const { connectDB } = await import('./config/db.js');
    await connectDB();
    await mongoose.connection.db!.dropDatabase();
    const { seed } = await import('./scripts/seed.js');
    await seed({ log: () => undefined });
    const { createApp } = await import('./app.js');
    app = createApp() as never;
  });
  afterAll(async () => {
    const { disconnectDB } = await import('./config/db.js');
    await disconnectDB();
  });

  it('seeds only enums', async () => {
    const { Lookup, User, Workspace } = await import('./models/index.js');
    expect(await Lookup.countDocuments({ type: 'bank', workspaceId: null })).toBeGreaterThan(4);
    expect(await User.countDocuments()).toBe(0);
    expect(await Workspace.countDocuments()).toBe(0);
  });

  it('registers a couple and invites the partner after registration', async () => {
    const r = await request(app).post('/api/auth/register').send({
      displayName: 'Sajin', email: 'Sajin@Example.com', password: 'Sajin995@', relationship: 'Husband', mode: 'couple',
      partner: { displayName: 'Abhirami', email: 'abhi@example.com', relationship: 'Wife' },
    }).expect(201);
    expect(r.body.user.email).toBe('sajin@example.com');
    expect(r.body.invite.email).toBe('abhi@example.com');
    expect(r.body.invite.sent).toBe(false); // no SMTP in tests
    inviteToken = r.body.invite.url.split('/invite/')[1];
    tokenS = r.body.token; sajinId = r.body.user.id;

    await request(app).post('/api/auth/register').send({ displayName: 'X', email: 'sajin@example.com', password: 'whatever12', mode: 'personal' }).expect(409);
    await request(app).post('/api/auth/register').send({ displayName: 'X', email: 'y@example.com', password: 'short', mode: 'personal' }).expect(400);
    // The invited partner cannot sign in before accepting.
    await request(app).post('/api/auth/login').send({ email: 'abhi@example.com', password: 'anything1' }).expect(401);

    const me = await request(app).get('/api/auth/me').set(auth(tokenS)).expect(200);
    expect(me.body.workspace.mode).toBe('couple');
    expect(me.body.workspace.members.map((m: any) => m.status)).toEqual(['active', 'invited']);
  });

  it('accepts the invitation', async () => {
    const info = await request(app).get(`/api/invitations/${inviteToken}`).expect(200);
    expect(info.body).toMatchObject({ email: 'abhi@example.com', invitedBy: 'Sajin', displayName: 'Abhirami' });
    const a = await request(app).post(`/api/invitations/${inviteToken}/accept`).send({ password: 'Abhi200@' }).expect(200);
    tokenA = a.body.token; abhiId = a.body.user.id;
    expect(a.body.user.workspaceId).toBe(JSON.parse(Buffer.from(tokenS.split('.')[1], 'base64url').toString()).wid);
    await request(app).post(`/api/invitations/${inviteToken}/accept`).send({ password: 'Abhi200@' }).expect(410);
  });

  it('rejects bad credentials and unauthenticated access', async () => {
    await request(app).post('/api/auth/login').send({ email: 'sajin@example.com', password: 'nope' }).expect(401);
    await request(app).get('/api/summary?month=2026-10&scope=common').expect(401);
    await request(app).get('/api/expenses?month=2026-10').set(auth('garbage')).expect(401);
    const s = await request(app).post('/api/auth/login').send({ email: 'SAJIN@example.com', password: 'Sajin995@' }).expect(200);
    expect(JSON.stringify(s.body)).not.toContain('passwordHash');
  });

  it('completes setup and generates the month income once', async () => {
    await request(app).put('/api/workspace').set(auth(tokenS)).send({
      members: [
        { userId: sajinId, displayName: 'Sajin', relationship: 'Husband', incomeSources: [{ source: 'Salary', amount: 11500, expectedDay: 28, active: true }] },
        { userId: abhiId, displayName: 'Abhirami', relationship: 'Wife', incomeSources: [{ source: 'Salary', amount: 9000, expectedDay: 28, active: true }] },
      ],
    }).expect(200);
    await request(app).put('/api/workspace').set(auth(tokenS)).send({ members: [{ userId: sajinId, displayName: 'S', relationship: 'Alien' }] }).expect(400);
    for (const [title, category, amount] of [['Apartment rent', 'Rent', 5500], ['Home internet', 'Internet', 389]] as const) {
      await request(app).post('/api/commitments').set(auth(tokenS)).send({ title, category, type: 'common', amount, startMonth: month, dueDay: 1 }).expect(201);
    }
    await request(app).post('/api/workspace/setup/complete').set(auth(tokenS)).send({ startMonth: month }).expect(200);
    await request(app).post('/api/workspace/setup/complete').set(auth(tokenS)).send({ startMonth: month }).expect(409);
    const [r1, r2] = await Promise.all([
      request(app).get(`/api/income?month=${month}`).set(auth(tokenS)),
      request(app).get(`/api/income?month=${month}`).set(auth(tokenA)),
    ]);
    expect(r1.body.length).toBe(2);
    expect(r2.body.length).toBe(2);
    const sal = r1.body.find((i: any) => i.userId === sajinId);
    expect(sal.expectedAmount).toBe(11500);
    const upd = await request(app).put(`/api/income/${sal._id}`).set(auth(tokenS)).send({ receivedAmount: 11500, receivedDate: `${month}-01` }).expect(200);
    expect(upd.body.status).toBe('received');
  });

  it('plans month-end salary as next month’s income', async () => {
    await request(app).put('/api/workspace').set(auth(tokenS)).send({
      members: [{ userId: sajinId, displayName: 'Sajin', relationship: 'Husband', incomeSources: [{ source: 'Salary', amount: 11500, expectedDay: 31, paidPreviousMonth: true, active: true }] }],
    }).expect(200);
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);
    const r = await request(app).get(`/api/income?month=${next}`).set(auth(tokenS)).expect(200);
    const sal = r.body.find((i: any) => i.userId === sajinId);
    expect(sal.month).toBe(next);
    expect(sal.expectedDate.slice(0, 7)).toBe(month); // paid at the end of this month, budgeted next month
    // It can be marked received now, before the budget month starts.
    const upd = await request(app).put(`/api/income/${sal._id}`).set(auth(tokenS)).send({ receivedAmount: 11500, receivedDate: sal.expectedDate }).expect(200);
    expect(upd.body.status).toBe('received');
  });

  it('validates categories against the lookup table', async () => {
    await request(app).post('/api/expenses').set(auth(tokenA)).send({
      date: `${month}-02`, description: 'X', category: 'Nonsense', amount: 1, paidBy: abhiId, type: 'common',
    }).expect(400);
    await request(app).post('/api/lookups').set(auth(tokenA)).send({ type: 'category', label: 'Pets' }).expect(201);
    await request(app).post('/api/lookups').set(auth(tokenA)).send({ type: 'incomeStatus', label: 'Hacked' }).expect(403);
    const l = await request(app).get('/api/lookups').set(auth(tokenS)).expect(200);
    expect(l.body.category.find((c: any) => c.code === 'Pets').custom).toBe(true);
  });

  it('records a common expense split 50/50 and a personal one', async () => {
    const c = await request(app).post('/api/expenses').set(auth(tokenA)).send({
      date: `${month}-02`, description: 'Lulu', category: 'Grocery', amount: 301, paidBy: abhiId, type: 'common',
    }).expect(201);
    expect(c.body.shares.map((s: any) => s.amount)).toEqual([150.5, 150.5]);
    await request(app).post('/api/expenses').set(auth(tokenS)).send({
      date: `${month}-03`, description: 'Taxi', category: 'Travel', amount: 50, paidBy: sajinId, type: 'personal',
    }).expect(201);
    await request(app).post('/api/expenses').set(auth(tokenS)).send({
      date: `${month}-03`, description: 'Bad', category: 'Travel', amount: 50, paidBy: new mongoose.Types.ObjectId().toHexString(), type: 'personal',
    }).expect(400);
  });

  it('does not allow expenses or payments for a month that has not started', async () => {
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);
    const r = await request(app).post('/api/expenses').set(auth(tokenS)).send({
      date: `${next}-01`, description: 'Advance', category: 'Travel', amount: 5, paidBy: sajinId, type: 'personal',
    }).expect(400);
    expect(r.body.error).toContain('has not started');
    const list = await request(app).get('/api/commitments').set(auth(tokenS));
    const afterNext = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) + 1, 1)).toISOString().slice(0, 7);
    await request(app).post(`/api/commitments/${list.body[0].id}/pay`).set(auth(tokenS)).send({ month: afterNext }).expect(400);
  });

  it('computes the summary for each scope', async () => {
    const s = await request(app).get(`/api/summary?month=${month}&scope=${sajinId}`).set(auth(tokenS)).expect(200);
    expect(s.body.cards.incomeReceived).toBe(11500);
    expect(s.body.cards.personalExpenses).toBe(50);
    expect(s.body.cards.commonShare).toBe(150.5);
    expect(s.body.cards.cashLeft).toBe(11299.5);
    const h = await request(app).get(`/api/summary?month=${month}&scope=common`).set(auth(tokenA)).expect(200);
    expect(h.body.cards.commonTotal).toBe(301);
    expect(h.body.cards.totalOutflow).toBe(351);
    expect(h.body.trend.length).toBe(6);
  });

  it('pays a commitment once (by the chosen member) and archives the expense', async () => {
    const list = await request(app).get('/api/commitments').set(auth(tokenS)).expect(200);
    const rent = list.body.find((c: any) => c.category === 'Rent');
    expect(rent.reminderDaysBefore).toBe(3);
    const paid = await request(app).post(`/api/commitments/${rent.id}/pay`).set(auth(tokenS)).send({ month, paidBy: abhiId }).expect(201);
    expect(paid.body.amount).toBe(rent.amount);
    expect(paid.body.paidBy).toBe(abhiId);
    await request(app).post(`/api/commitments/${rent.id}/pay`).set(auth(tokenS)).send({ month }).expect(400);
    await request(app).post(`/api/expenses/${paid.body._id}/archive`).set(auth(tokenS)).expect(200);
    await request(app).delete(`/api/expenses/${paid.body._id}`).set(auth(tokenS)).expect(404);
    const all = await request(app).get(`/api/expenses?month=${month}&includeArchived=true`).set(auth(tokenS));
    expect(all.body.find((e: any) => e._id === paid.body._id).status).toBe('archived');
    await request(app).get('/api/reminders').set(auth(tokenS)).expect(200);
  });

  it('keeps the old amount for earlier months, and deletes a commitment that is not needed', async () => {
    const list = await request(app).get('/api/commitments').set(auth(tokenS));
    const net = list.body.find((c: any) => c.category === 'Internet');
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);
    const u = await request(app).put(`/api/commitments/${net.id}`).set(auth(tokenS)).send({ amount: 450, amountEffectiveFrom: next }).expect(200);
    expect(u.body.amountHistory).toEqual([{ fromMonth: month, amount: net.amount }, { fromMonth: next, amount: 450 }]);

    const emi = await request(app).post('/api/commitments').set(auth(tokenS)).send({
      title: 'Mobile EMI', category: 'EMI', type: 'personal', ownerId: sajinId, amount: 250, startMonth: month, dueDay: 15,
    }).expect(201);
    const paid = await request(app).post(`/api/commitments/${emi.body.id}/pay`).set(auth(tokenS)).send({ month }).expect(201);
    const del = await request(app).delete(`/api/commitments/${emi.body.id}`).set(auth(tokenS)).expect(200);
    expect(del.body.unlinkedPayments).toBe(1);
    const after = await request(app).get('/api/commitments').set(auth(tokenS));
    expect(after.body.find((c: any) => c.id === emi.body.id)).toBeUndefined();
    const exp = await request(app).get(`/api/expenses?month=${month}`).set(auth(tokenS));
    expect(exp.body.find((e: any) => e._id === paid.body._id).commitmentId).toBeUndefined(); // payment is kept
  });

  it('tracks accounts, balances, transfers and wealth', async () => {
    await request(app).post('/api/accounts').set(auth(tokenS)).send({
      name: 'Bad', bank: 'NOPE', currency: 'AED', accountType: 'savings', type: 'common', openedMonth: month,
    }).expect(400);
    const bank = await request(app).post('/api/lookups').set(auth(tokenS)).send({ type: 'bank', label: 'Wio Bank', meta: { currency: 'AED' } }).expect(201);
    expect(bank.body.code).toBe('WIO BANK');
    const enbd = await request(app).post('/api/accounts').set(auth(tokenS)).send({
      name: 'ENBD salary', bank: 'ENBD', currency: 'AED', accountType: 'savings', type: 'personal', ownerId: sajinId, openedMonth: month, openingBalance: 10000,
    }).expect(201);
    const sbi = await request(app).post('/api/accounts').set(auth(tokenS)).send({
      name: 'SBI NRE', bank: 'SBI', currency: 'INR', accountType: 'savings', type: 'common', openedMonth: month,
    }).expect(201);
    await request(app).put('/api/account-balances').set(auth(tokenS)).send({ month, items: [{ accountId: sbi.body.id, balance: 235000 }] }).expect(200);
    await request(app).post('/api/transfers').set(auth(tokenS)).send({
      date: `${month}-05`, fromAccountId: enbd.body.id, toAccountId: sbi.body.id, amount: 1000,
    }).expect(400); // cross-currency needs the received amount
    await request(app).post('/api/transfers').set(auth(tokenS)).send({
      date: `${month}-05`, fromAccountId: enbd.body.id, toAccountId: sbi.body.id, amount: 1000, toAmount: 23500,
    }).expect(201);
    await request(app).put('/api/workspace').set(auth(tokenS)).send({ fxRates: { INR: 23.5 } }).expect(200);
    const w = await request(app).get(`/api/wealth?month=${month}`).set(auth(tokenA)).expect(200);
    // ENBD: 10,000 entered when added, less the 1,000 sent this month. SBI: 235,000 entered as the month-end balance.
    expect(w.body.byCurrency.map((c: any) => [c.currency, c.net])).toEqual([['AED', 9000], ['INR', 235000]]);
    expect(w.body.combined.net).toBe(19000);
    expect(w.body.transferSummary[0]).toMatchObject({ from: 'AED', to: 'INR', amount: 1000, toAmount: 23500, rate: 23.5 });
    const mine = await request(app).get(`/api/wealth?month=${month}&scope=${abhiId}`).set(auth(tokenA)).expect(200);
    expect(mine.body.accounts).toEqual([]);
  });

  it('never allocates more than a goal’s target and completes it when reached', async () => {
    const g = await request(app).post('/api/goals').set(auth(tokenS)).send({ name: 'Emergency fund', targetAmount: 10000, type: 'common' }).expect(201);
    const alloc = (amount: number) => request(app).post(`/api/goals/${g.body._id}/allocations`).set(auth(tokenS)).send({ userId: sajinId, date: `${month}-01`, amount });
    await alloc(6000).expect(201);
    const over = await alloc(5000).expect(400);
    expect(over.body.error).toContain('Only 4000.00 is left');
    await request(app).put(`/api/goals/${g.body._id}`).set(auth(tokenS)).send({ targetAmount: 5000 }).expect(400);
    await alloc(4000).expect(201);
    const goals = await request(app).get('/api/goals').set(auth(tokenS));
    const done = goals.body.find((x: any) => x._id === g.body._id);
    expect(done).toMatchObject({ status: 'completed', allocatedTotal: 10000 });
    await alloc(1).expect(400);
  });

  it('blocks access to another workspace', async () => {
    const reg = await request(app).post('/api/auth/register').send({ displayName: 'X', email: 'intruder@example.com', password: 'Intruder1!', mode: 'personal' }).expect(201);
    const t = reg.body.token;
    expect((await request(app).get('/api/auth/me').set(auth(t))).body.workspace.mode).toBe('personal');
    const theirs = await request(app).get(`/api/expenses?month=${month}`).set(auth(t)).expect(200);
    expect(theirs.body).toEqual([]);
    const { Expense, Account } = await import('./models/index.js');
    const victim = await Expense.findOne({ description: 'Lulu' }).lean();
    await request(app).put(`/api/expenses/${victim!._id}`).set(auth(t)).send({ amount: 1 }).expect(404);
    await request(app).get(`/api/summary?month=${month}&scope=${sajinId}`).set(auth(t)).expect(400);
    const acc = await Account.findOne({ name: 'SBI NRE' }).lean();
    await request(app).put('/api/account-balances').set(auth(t)).send({ month, items: [{ accountId: String(acc!._id), balance: 1 }] }).expect(400);
    expect((await request(app).get('/api/lookups').set(auth(t))).body.category.find((c: any) => c.code === 'Pets')).toBeUndefined();
  });

  it('exports, validates and restores a backup (with a pre-restore snapshot)', async () => {
    const exp = await request(app).get('/api/backup/export').set(auth(tokenS)).expect(200);
    expect(exp.body.schemaVersion).toBe(2);
    expect(exp.body.data.accounts.length).toBe(2);
    expect(JSON.stringify(exp.body)).not.toContain('passwordHash');
    const before = exp.body.data.expenses.length;

    // change data after the backup
    await request(app).post('/api/expenses').set(auth(tokenS)).send({
      date: `${month}-05`, description: 'After backup', category: 'Travel', amount: 10, paidBy: sajinId, type: 'personal',
    }).expect(201);

    const bad = await request(app).post('/api/backup/validate').set(auth(tokenS)).send({ hello: 'world' }).expect(200);
    expect(bad.body.valid).toBe(false);
    await request(app).post('/api/backup/restore').set(auth(tokenS)).send({ ...exp.body, schemaVersion: 'x' }).expect(400);
    const tampered = structuredClone(exp.body);
    tampered.data.expenses[0].shares[0].amount = 99999;
    expect((await request(app).post('/api/backup/validate').set(auth(tokenS)).send(tampered)).body.valid).toBe(false);

    const ok = await request(app).post('/api/backup/validate').set(auth(tokenS)).send(exp.body).expect(200);
    expect(ok.body.valid).toBe(true);
    const r = await request(app).post('/api/backup/restore').set(auth(tokenS)).send(exp.body).expect(200);
    expect(r.body.preRestoreBackupId).toBeTruthy();

    const all = await request(app).get(`/api/expenses?month=${month}&includeArchived=true`).set(auth(tokenS));
    expect(all.body.length).toBe(before);
    expect(all.body.find((e: any) => e.description === 'After backup')).toBeUndefined();
    expect((await request(app).get('/api/accounts').set(auth(tokenS))).body.length).toBe(2);

    const snaps = await request(app).get('/api/backup/snapshots').set(auth(tokenS)).expect(200);
    expect(snaps.body[0].reason).toBe('pre-restore');
    const snap = await request(app).get(`/api/backup/snapshots/${snaps.body[0].id}`).set(auth(tokenS)).expect(200);
    expect(snap.body.data.expenses.find((e: any) => e.description === 'After backup')).toBeTruthy();

    // users can still log in after restore
    await request(app).post('/api/auth/login').send({ email: 'abhi@example.com', password: 'Abhi200@' }).expect(200);
  });

  it('moves the opening balance when an account starts in an earlier month', async () => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const acc = await request(app).post('/api/accounts').set(auth(tokenS)).send({
      name: 'RAK savings', bank: 'RAK', currency: 'AED', accountType: 'savings', type: 'personal', ownerId: sajinId, openedMonth: month, openingBalance: 5000,
    }).expect(201);
    await request(app).put(`/api/accounts/${acc.body.id}`).set(auth(tokenS)).send({ openedMonth: prev }).expect(200);
    const b = await request(app).get(`/api/balances?month=${prev}`).set(auth(tokenS)).expect(200);
    expect(b.body.accounts.find((a: any) => a.id === acc.body.id)).toMatchObject({ opening: 5000, closing: 5000 });

    // Accounts / Wealth show the same calculated balance as Balances when no balance was entered for the month.
    await request(app).post('/api/income').set(auth(tokenS)).send({
      userId: sajinId, month, source: 'Salary', expectedAmount: 1200, receivedAmount: 1000, receivedDate: `${month}-01`, accountId: acc.body.id, status: 'received',
    }).expect(201);
    const w = await request(app).get(`/api/wealth?month=${month}`).set(auth(tokenS)).expect(200);
    expect(w.body.accounts.find((a: any) => a.id === acc.body.id)).toMatchObject({ current: 6000, previous: 5000, recordedThisMonth: false, lastRecordedMonth: prev });
    const s = await request(app).get(`/api/summary?month=${month}&scope=${sajinId}`).set(auth(tokenS)).expect(200);
    expect(s.body.cards.incomePending).toBe(0); // 1000 of 1200 marked received: nothing left pending
  });

  it('lets each partner pay part of a common commitment until it is fully paid', async () => {
    const c = await request(app).post('/api/commitments').set(auth(tokenS)).send({
      title: 'Shared internet', category: 'Internet', amount: 400, type: 'common', startMonth: month, dueDay: 1,
    }).expect(201);
    await request(app).post(`/api/commitments/${c.body.id}/pay`).set(auth(tokenS)).send({ month, amount: 200, paidBy: sajinId }).expect(201);
    const mid = (await request(app).get(`/api/commitments?month=${month}`).set(auth(tokenS))).body.find((x: any) => x.id === c.body.id);
    expect(mid.payment).toMatchObject({ paid: false, paidAmount: 200, remaining: 200 });
    const due = (await request(app).get(`/api/summary?month=${month}&scope=common`).set(auth(tokenA))).body.commitmentsDue.find((x: any) => x.id === c.body.id);
    expect(due).toMatchObject({ paid: false, payment: { remaining: 200 } }); // dashboard agrees
    await request(app).post(`/api/commitments/${c.body.id}/pay`).set(auth(tokenA)).send({ month, paidBy: abhiId }).expect(201); // the rest
    const done = (await request(app).get(`/api/commitments?month=${month}`).set(auth(tokenS))).body.find((x: any) => x.id === c.body.id);
    expect(done.payment).toMatchObject({ paid: true, paidAmount: 400, contributions: [{ userId: sajinId, amount: 200 }, { userId: abhiId, amount: 200 }] });
    await request(app).post(`/api/commitments/${c.body.id}/pay`).set(auth(tokenS)).send({ month }).expect(400);
  });

  it('splits a common commitment by agreed amounts, and records support for a partner’s bill', async () => {
    const before = (await request(app).get(`/api/summary?month=${month}&scope=${abhiId}`).set(auth(tokenA))).body.cards;
    const c = await request(app).post('/api/commitments').set(auth(tokenS)).send({
      title: 'Mobile plan', category: 'Internet', amount: 350, type: 'common', startMonth: month, dueDay: 1,
      split: { mode: 'custom', shares: [{ userId: sajinId, amount: 150 }, { userId: abhiId, amount: 200 }] },
    }).expect(201);
    const listed = (await request(app).get(`/api/commitments?month=${month}`).set(auth(tokenS))).body.find((x: any) => x.id === c.body.id);
    expect(listed.split.mode).toBe('custom');
    expect(listed.shares).toEqual([{ userId: sajinId, amount: 150 }, { userId: abhiId, amount: 200 }]);
    const due = (await request(app).get(`/api/summary?month=${month}&scope=${abhiId}`).set(auth(tokenA))).body.commitmentsDue.find((x: any) => x.id === c.body.id);
    expect(due.myShare).toBe(200);
    // Each pays their own part: nobody owes anything for it.
    await request(app).post(`/api/commitments/${c.body.id}/pay`).set(auth(tokenS)).send({ month, amount: 150, paidBy: sajinId }).expect(201);
    await request(app).post(`/api/commitments/${c.body.id}/pay`).set(auth(tokenA)).send({ month, paidBy: abhiId }).expect(201);
    const after = (await request(app).get(`/api/summary?month=${month}&scope=${abhiId}`).set(auth(tokenA))).body.cards;
    const bal = (cards: any) => cards.members.find((m: any) => m.userId === abhiId).balance;
    expect(bal(after)).toBeCloseTo(bal(before), 2);
    expect(after.commonShare - before.commonShare).toBeCloseTo(200, 2);

    // Abhirami pays Sajin's personal commitment: it is paid, and the cost is hers.
    const p = await request(app).post('/api/commitments').set(auth(tokenS)).send({
      title: 'Sajin phone EMI', category: 'Internet', amount: 120, type: 'personal', ownerId: sajinId, startMonth: month, dueDay: 1,
    }).expect(201);
    const sBefore = (await request(app).get(`/api/summary?month=${month}&scope=${sajinId}`).set(auth(tokenS))).body.cards;
    await request(app).post(`/api/commitments/${p.body.id}/pay`).set(auth(tokenA)).send({ month, paidBy: abhiId }).expect(201);
    const sAfter = (await request(app).get(`/api/summary?month=${month}&scope=${sajinId}`).set(auth(tokenS))).body;
    expect(sAfter.cards.personalExpenses).toBe(sBefore.personalExpenses);
    expect(sAfter.commitmentsDue.find((x: any) => x.id === p.body.id)).toMatchObject({ paid: true, payment: { contributions: [{ userId: abhiId, amount: 120 }] } });
    expect(sAfter.cards.support).toEqual([{ from: abhiId, to: sajinId, amount: 120 }]);
    const aAfter = (await request(app).get(`/api/summary?month=${month}&scope=${abhiId}`).set(auth(tokenA))).body.cards;
    expect(aAfter.personalExpenses - after.personalExpenses).toBeCloseTo(120, 2);
  });

  it('lets a partner send their share to the one who pays the bill, or into a joint account', async () => {
    const bal = async () => Object.fromEntries((await request(app).get(`/api/summary?month=${month}&scope=common`).set(auth(tokenS))).body.cards.members.map((m: any) => [m.userId, m.balance]));
    const accounts = (await request(app).get('/api/accounts').set(auth(tokenS))).body;
    const enbd = accounts.find((a: any) => a.name === 'ENBD salary');
    const joint = await request(app).post('/api/accounts').set(auth(tokenS)).send({
      name: 'Joint', bank: 'ENBD', currency: 'AED', accountType: 'savings', type: 'common', openedMonth: month,
    }).expect(201);
    const enbdBefore = (await request(app).get(`/api/balances?month=${month}`).set(auth(tokenS))).body.accounts.find((a: any) => a.id === enbd.id).closing;
    const start = await bal();

    // Abhirami sends her 1500 into Sajin's account; he then pays the whole 3000 rent.
    const rent = await request(app).post('/api/commitments').set(auth(tokenS)).send({
      title: 'Flat rent', category: 'Rent', amount: 3000, type: 'common', startMonth: month, dueDay: 1,
    }).expect(201);
    const sent = await request(app).post(`/api/commitments/${rent.body.id}/shares`).set(auth(tokenA)).send({ month, amount: 1500, toAccountId: enbd.id }).expect(201);
    expect(sent.body).toMatchObject({ fromUserId: abhiId, toUserId: sajinId, amount: 1500 });
    const listed = (await request(app).get(`/api/commitments?month=${month}`).set(auth(tokenS))).body.find((x: any) => x.id === rent.body.id);
    expect(listed.payment).toMatchObject({ paid: false, paidAmount: 0, sent: [{ fromUserId: abhiId, toUserId: sajinId, amount: 1500 }] });
    const holding = await bal();
    expect(holding[sajinId] - start[sajinId]).toBeCloseTo(-1500, 2); // Sajin holds her money until he pays
    const enbdMid = (await request(app).get(`/api/balances?month=${month}`).set(auth(tokenS))).body.accounts.find((a: any) => a.id === enbd.id).closing;
    expect(enbdMid - enbdBefore).toBeCloseTo(1500, 2);
    await request(app).post(`/api/commitments/${rent.body.id}/pay`).set(auth(tokenS)).send({ month, amount: 3000, paidBy: sajinId }).expect(201);
    const settled = await bal();
    expect(settled[sajinId]).toBeCloseTo(start[sajinId], 2);
    expect(settled[abhiId]).toBeCloseTo(start[abhiId], 2);

    // Both put 50 into the joint account and the 100 bill is paid from it: nobody owes.
    const gas = await request(app).post('/api/commitments').set(auth(tokenS)).send({
      title: 'Cooking gas', category: 'Internet', amount: 100, type: 'common', startMonth: month, dueDay: 1,
    }).expect(201);
    await request(app).post(`/api/commitments/${gas.body.id}/shares`).set(auth(tokenA)).send({ month, amount: 50, toAccountId: joint.body.id }).expect(201);
    const mine = await request(app).post(`/api/commitments/${gas.body.id}/shares`).set(auth(tokenS)).send({ month, amount: 50, toAccountId: joint.body.id }).expect(201);
    await request(app).post(`/api/commitments/${gas.body.id}/pay`).set(auth(tokenS)).send({ month, paidBy: sajinId, accountId: joint.body.id }).expect(201);
    const after = await bal();
    expect(after[sajinId]).toBeCloseTo(start[sajinId], 2);
    // Undoing Sajin's share: the joint money now came only from Abhirami's 50 plus a 50/50 rest, so he owes her 25.
    await request(app).delete(`/api/commitments/${gas.body.id}/shares/${mine.body.id}`).set(auth(tokenS)).expect(200);
    expect((await bal())[sajinId] - start[sajinId]).toBeCloseTo(-25, 2);
    await request(app).post(`/api/commitments/${gas.body.id}/shares`).set(auth(tokenS)).send({ month, amount: 50, toUserId: sajinId }).expect(400); // not to yourself
  });

  it('pays next month’s commitment early: dated today, counted in next month', async () => {
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);
    const c = await request(app).post('/api/commitments').set(auth(tokenS)).send({
      title: 'Next rent', category: 'Rent', amount: 400, type: 'personal', ownerId: sajinId, startMonth: month, dueDay: 1,
    }).expect(201);
    const paid = await request(app).post(`/api/commitments/${c.body.id}/pay`).set(auth(tokenS)).send({ month: next, amount: 300, settles: true }).expect(201); // smaller bill, fully paid
    expect(paid.body).toMatchObject({ month: next, amount: 300 });
    expect(paid.body.date.slice(0, 7)).toBe(month);
    const nextExp = await request(app).get(`/api/expenses?month=${next}`).set(auth(tokenS)).expect(200);
    expect(nextExp.body.find((e: any) => e.commitmentId === c.body.id)).toBeTruthy();
    await request(app).post(`/api/commitments/${c.body.id}/pay`).set(auth(tokenS)).send({ month: next }).expect(400); // only once
  });

  describe('admin panel', () => {
    let adminToken = '';
    const admin = () => ({ Authorization: `Bearer ${adminToken}` });
    const registerCouple = async (me: string, partner: string) => {
      const r = await request(app).post('/api/auth/register').send({
        displayName: me, email: `${me}@example.com`, password: 'Passw0rd!', relationship: 'Husband', mode: 'couple',
        partner: { displayName: partner, email: `${partner}@example.com`, relationship: 'Wife' },
      }).expect(201);
      const users = (await request(app).get('/api/admin/users').set(admin()).expect(200)).body;
      return { token: r.body.token as string, invite: r.body.invite.url.split('/invite/')[1] as string, me: users.find((u: any) => u.displayName === me), partner: users.find((u: any) => u.displayName === partner) };
    };

    it('signs in only with an admin from the database', async () => {
      const { Admin } = await import('./models/index.js');
      const bcrypt = (await import('bcryptjs')).default;
      await Admin.create({ username: 'root', passwordHash: await bcrypt.hash('Adm1n-pass', 4) });
      await request(app).post('/api/admin/login').send({ username: 'root', password: 'wrong' }).expect(401);
      await request(app).get('/api/admin/users').set(auth(tokenS)).expect(401); // a user session is not an admin
      adminToken = (await request(app).post('/api/admin/login').send({ username: 'ROOT', password: 'Adm1n-pass' }).expect(200)).body.token;
      await request(app).get('/api/auth/me').set(admin()).expect(401); // and the other way round
    });

    it('stops old admin sessions when the password is reset', async () => {
      const { Admin } = await import('./models/index.js');
      await Admin.updateOne({ username: 'root' }, { $set: { passwordChangedAt: new Date(Date.now() + 5000) } });
      await request(app).get('/api/admin/users').set(admin()).expect(401);
      await Admin.updateOne({ username: 'root' }, { $unset: { passwordChangedAt: 1 } });
    });

    it('correcting a wrong invited email cancels the old link', async () => {
      const c = await registerCouple('typo-owner', 'typo-partner');
      const r = await request(app).put(`/api/admin/users/${c.partner.id}`).set(admin()).send({ email: 'right@example.com' }).expect(200);
      expect(r.body.invite.email).toBe('right@example.com');
      await request(app).get(`/api/invitations/${c.invite}`).expect(404);
      const pending = (await request(app).get('/api/workspace/invitations').set(auth(c.token)).expect(200)).body;
      expect(pending.map((i: any) => i.email)).toEqual(['right@example.com']);
    });

    it('corrects the email of someone who already joined', async () => {
      const r = await request(app).put(`/api/admin/users/${abhiId}`).set(admin()).send({ email: 'abhi.correct@example.com' }).expect(200);
      expect(r.body.user.email).toBe('abhi.correct@example.com');
      await request(app).post('/api/auth/login').send({ email: 'abhi.correct@example.com', password: 'Abhi200@' }).expect(200);
      await request(app).put(`/api/admin/users/${abhiId}`).set(admin()).send({ email: 'sajin@example.com' }).expect(409); // already someone's
    });

    it('changes a password: old sessions end and the new password works', async () => {
      await request(app).get('/api/auth/me').set(auth(tokenA)).expect(200);
      const { User } = await import('./models/index.js');
      await User.updateOne({ _id: abhiId }, { $set: { passwordChangedAt: new Date(Date.now() + 5000) } });
      await request(app).get('/api/auth/me').set(auth(tokenA)).expect(401);
      await request(app).put(`/api/admin/users/${abhiId}/password`).set(admin()).send({ password: 'short' }).expect(400);
      await request(app).put(`/api/admin/users/${abhiId}/password`).set(admin()).send({ password: 'Brand-new-1' }).expect(200);
      await request(app).post('/api/auth/login').send({ email: 'abhi.correct@example.com', password: 'Abhi200@' }).expect(401);
      tokenA = (await request(app).post('/api/auth/login').send({ email: 'abhi.correct@example.com', password: 'Brand-new-1' }).expect(200)).body.token;
      await request(app).get('/api/auth/me').set(auth(tokenA)).expect(200);
    });

    it('a password makes an invited person able to sign in', async () => {
      const c = await registerCouple('pw-owner', 'pw-partner');
      const u = await request(app).put(`/api/admin/users/${c.partner.id}/password`).set(admin()).send({ password: 'Joined-now-1' }).expect(200);
      expect(u.body.status).toBe('active');
      await request(app).post('/api/auth/login').send({ email: 'pw-partner@example.com', password: 'Joined-now-1' }).expect(200);
      await request(app).get(`/api/invitations/${c.invite}`).expect(404);
    });

    it('freezes and unfreezes', async () => {
      await request(app).put(`/api/admin/users/${abhiId}`).set(admin()).send({ status: 'disabled' }).expect(200);
      await request(app).get('/api/auth/me').set(auth(tokenA)).expect(401);
      await request(app).post('/api/auth/login').send({ email: 'abhi.correct@example.com', password: 'Brand-new-1' }).expect(401);
      await request(app).put(`/api/admin/users/${abhiId}`).set(admin()).send({ status: 'active' }).expect(200);
      await request(app).get('/api/auth/me').set(auth(tokenA)).expect(200);
    });

    it('shows a short info card with the salary', async () => {
      const ws = (await request(app).get('/api/workspace').set(auth(tokenS)).expect(200)).body;
      const salary = ws.members.find((m: any) => m.userId === sajinId).incomeSources.filter((s: any) => s.active);
      const d = (await request(app).get(`/api/admin/users/${sajinId}`).set(admin()).expect(200)).body;
      expect(d).toMatchObject({ displayName: 'Sajin', partner: 'Abhirami', currency: 'AED' });
      expect(d.salaryTotal).toBe(salary.reduce((a: number, s: any) => a + s.amount, 0));
      expect(d).not.toHaveProperty('passwordHash');
    });

    it('deleting one of two keeps the shared records and frees the email', async () => {
      const { Expense, User } = await import('./models/index.js');
      const before = await Expense.countDocuments();
      await request(app).delete(`/api/admin/users/${abhiId}`).set(admin()).expect(200);
      await request(app).get('/api/auth/me').set(auth(tokenA)).expect(401);
      await request(app).post('/api/auth/login').send({ email: 'abhi.correct@example.com', password: 'Brand-new-1' }).expect(401);
      expect(await Expense.countDocuments()).toBe(before);
      expect(await User.findById(abhiId).select('+passwordHash').lean()).toMatchObject({ status: 'invited', displayName: 'Abhirami' });
      const users = (await request(app).get('/api/admin/users').set(admin()).expect(200)).body;
      expect(users.some((u: any) => u.id === abhiId)).toBe(false);
      expect(users.find((u: any) => u.id === sajinId).lastInWorkspace).toBe(true);
      // The partner can invite someone to the open member slot.
      const inv = await request(app).post('/api/workspace/invitations').set(auth(tokenS)).send({ email: 'abhi.correct@example.com' }).expect(201);
      const joined = await request(app).post(`/api/invitations/${inv.body.url.split('/invite/')[1]}/accept`).send({ password: 'Back-again-1' }).expect(200);
      expect(joined.body.user.id).toBe(abhiId);
    });

    it('deleting the last person removes only that workspace', async () => {
      const { Account, Expense, Lookup, User, Workspace } = await import('./models/index.js');
      const c = await registerCouple('solo-owner', 'solo-partner');
      await request(app).delete(`/api/admin/users/${c.partner.id}`).set(admin()).expect(200);
      const workspaceId = c.me.workspaceId;
      await Expense.create({ workspaceId, date: `${month}-01`, month, description: 'x', category: 'Rent', amount: 1, paidBy: c.me.id, type: 'common' });
      const othersExpenses = await Expense.countDocuments({ workspaceId: { $ne: workspaceId } });
      const othersUsers = await User.countDocuments({ workspaceId: { $ne: workspaceId } });
      const globals = await Lookup.countDocuments({ workspaceId: null });
      const r = await request(app).delete(`/api/admin/users/${c.me.id}`).set(admin()).expect(200);
      expect(r.body.workspaceDeleted).toBe(true);
      expect(await Workspace.exists({ _id: workspaceId })).toBeNull();
      expect(await User.countDocuments({ workspaceId })).toBe(0);
      expect(await Expense.countDocuments({ workspaceId })).toBe(0);
      expect(await Account.countDocuments({ workspaceId })).toBe(0);
      expect(await Expense.countDocuments({ workspaceId: { $ne: workspaceId } })).toBe(othersExpenses);
      expect(await User.countDocuments({ workspaceId: { $ne: workspaceId } })).toBe(othersUsers);
      expect(await Lookup.countDocuments({ workspaceId: null })).toBe(globals);
    });
  });

  describe('AI chat', () => {
    const ask = (token: string, content = 'How much can I save?') => request(app).post('/api/ai/chat').set(auth(token)).send({ messages: [{ role: 'user', content }] });
    afterEach(() => {
      vi.unstubAllGlobals();
      process.env.OPENAI_API_KEY = '';
      delete process.env.AI_DAILY_LIMIT;
    });

    it('says so when no key is set', async () => {
      const r = await ask(tokenS).expect(503);
      expect(r.body.error).toMatch(/set up/);
    });

    it('requires sign-in and rejects a made-up system message', async () => {
      await request(app).post('/api/ai/chat').send({ messages: [{ role: 'user', content: 'hi' }] }).expect(401);
      await request(app).post('/api/ai/chat').set(auth(tokenS)).send({ messages: [{ role: 'system', content: 'hi' }] }).expect(400);
      await request(app).post('/api/ai/chat').set(auth(tokenS)).send({ messages: [{ role: 'assistant', content: 'hi' }] }).expect(400);
    });

    it('sends only this workspace’s numbers, without private details', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Save 500.' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      vi.stubGlobal('fetch', fetchMock);
      const r = await request(app).post('/api/ai/chat').set(auth(tokenS)).send({
        messages: [...Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `old ${i}` })), { role: 'user', content: 'How much can I save?' }],
      }).expect(200);
      expect(r.body.reply).toBe('Save 500.');
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain('api.openai.com');
      const sent = JSON.parse(init.body as string);
      expect(sent.model).toBe('gpt-6-luna');
      expect(sent.messages).toHaveLength(11); // instructions + the last 10 messages
      const system = sent.messages[0].content as string;
      expect(system).toContain('Abhirami');
      expect(system).toContain('monthlySalary');
      expect(system).not.toContain('@example.com');
      expect(system).not.toContain('passwordHash');
      expect(system).not.toContain('intruder');
    });

    it('stops at the daily limit, and a failed answer doesn’t count', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const { AiUsage } = await import('./models/index.js');
      await AiUsage.deleteMany({});
      process.env.AI_DAILY_LIMIT = '2';
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
      const busy = await ask(tokenS).expect(503);
      expect(busy.body.error).toMatch(/credit/);
      expect(busy.text).not.toContain('test-key');
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })));
      await ask(tokenS).expect(200);
      await ask(tokenS).expect(200);
      await ask(tokenS).expect(429);
    });
  });
});
