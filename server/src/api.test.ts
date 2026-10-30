/**
 * End-to-end API test against a real MongoDB-compatible server.
 * Runs only when TEST_MONGODB_URI is set, and only ever uses the `finance_test` database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

const uri = process.env.TEST_MONGODB_URI;
const d = uri ? describe : describe.skip;

d('API', () => {
  let app: import('express').Express;
  let tokenS = '', tokenA = '', sajinId = '', abhiId = '';
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = 'finance_test';
    process.env.JWT_SECRET ??= 'x'.repeat(40);
    process.env.SEED_SAJIN_PASSWORD = 'Sajin995@';
    process.env.SEED_ABHIRAMI_PASSWORD = 'Abhi200@';
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

  it('rejects bad credentials and unauthenticated access', async () => {
    await request(app).post('/api/auth/login').send({ username: 'sajin', password: 'nope' }).expect(401);
    await request(app).get('/api/summary?month=2026-10&scope=common').expect(401);
    await request(app).get('/api/expenses?month=2026-10').set(auth('garbage')).expect(401);
  });

  it('logs in both users into the same workspace', async () => {
    const s = await request(app).post('/api/auth/login').send({ username: 'sajin', password: 'Sajin995@' }).expect(200);
    const a = await request(app).post('/api/auth/login').send({ username: 'abhirami', password: 'Abhi200@' }).expect(200);
    expect(s.body.user.workspaceId).toBe(a.body.user.workspaceId);
    expect(JSON.stringify(s.body)).not.toContain('passwordHash');
    tokenS = s.body.token; tokenA = a.body.token; sajinId = s.body.user.id; abhiId = a.body.user.id;
  });

  it('completes setup and generates the month income once', async () => {
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

  it('pays a commitment once and archives instead of deleting', async () => {
    const list = await request(app).get('/api/commitments').set(auth(tokenS)).expect(200);
    const rent = list.body.find((c: any) => c.category === 'Rent');
    const paid = await request(app).post(`/api/commitments/${rent.id}/pay`).set(auth(tokenS)).send({ month }).expect(201);
    expect(paid.body.amount).toBe(rent.amount);
    await request(app).post(`/api/commitments/${rent.id}/pay`).set(auth(tokenS)).send({ month }).expect(400);
    await request(app).post(`/api/expenses/${paid.body._id}/archive`).set(auth(tokenS)).expect(200);
    await request(app).delete(`/api/expenses/${paid.body._id}`).set(auth(tokenS)).expect(404);
    const after = await request(app).get(`/api/expenses?month=${month}`).set(auth(tokenS));
    expect(after.body.find((e: any) => e._id === paid.body._id)).toBeUndefined();
    const all = await request(app).get(`/api/expenses?month=${month}&includeArchived=true`).set(auth(tokenS));
    expect(all.body.find((e: any) => e._id === paid.body._id).status).toBe('archived');
  });

  it('keeps the old amount for earlier months when a commitment changes', async () => {
    const list = await request(app).get('/api/commitments').set(auth(tokenS));
    const net = list.body.find((c: any) => c.category === 'Internet');
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) , 1)).toISOString().slice(0, 7);
    const u = await request(app).put(`/api/commitments/${net.id}`).set(auth(tokenS)).send({ amount: 450, amountEffectiveFrom: next }).expect(200);
    expect(u.body.amountHistory).toEqual([{ fromMonth: month, amount: net.amount }, { fromMonth: next, amount: 450 }]);
    const ended = await request(app).post(`/api/commitments/${net.id}/end`).set(auth(tokenS)).send({ endMonth: month }).expect(200);
    expect(ended.body.endMonth).toBe(month);
  });

  it('blocks access to another workspace', async () => {
    const { Workspace, User, Expense } = await import('./models/index.js');
    const { hashPassword } = await import('./services/auth.service.js');
    const ws = await Workspace.create({ name: 'Other', startMonth: month, setupCompleted: true, members: [] });
    const u = await User.create({ username: 'intruder', passwordHash: await hashPassword('Intruder1!'), displayName: 'X', workspaceId: ws._id });
    ws.members.push({ userId: u._id, displayName: 'X', relationship: '', incomeSources: [] } as never);
    await ws.save();
    const t = (await request(app).post('/api/auth/login').send({ username: 'intruder', password: 'Intruder1!' })).body.token;
    const theirs = await request(app).get(`/api/expenses?month=${month}`).set(auth(t)).expect(200);
    expect(theirs.body).toEqual([]);
    const victim = await Expense.findOne({ description: 'Lulu' }).lean();
    await request(app).put(`/api/expenses/${victim!._id}`).set(auth(t)).send({ amount: 1 }).expect(404);
    await request(app).get(`/api/summary?month=${month}&scope=${sajinId}`).set(auth(t)).expect(400);
  });

  it('exports, validates and restores a backup (with a pre-restore snapshot)', async () => {
    const exp = await request(app).get('/api/backup/export').set(auth(tokenS)).expect(200);
    expect(exp.body.schemaVersion).toBe(1);
    expect(exp.body.exportedAt).toBeTruthy();
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

    const snaps = await request(app).get('/api/backup/snapshots').set(auth(tokenS)).expect(200);
    expect(snaps.body[0].reason).toBe('pre-restore');
    const snap = await request(app).get(`/api/backup/snapshots/${snaps.body[0].id}`).set(auth(tokenS)).expect(200);
    expect(snap.body.data.expenses.find((e: any) => e.description === 'After backup')).toBeTruthy();

    // users can still log in after restore
    await request(app).post('/api/auth/login').send({ username: 'abhirami', password: 'Abhi200@' }).expect(200);
  });
});
