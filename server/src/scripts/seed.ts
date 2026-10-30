/**
 * Creates the shared workspace, the two predefined users and the initial
 * commitments. Safe to run more than once: existing users/workspace are kept.
 *
 *   npm run seed                     # create if missing
 *   npm run seed -- --reset-passwords  # re-hash passwords from env
 */
import fs from 'node:fs';
import path from 'node:path';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Commitment, User, Workspace } from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';
import { currentMonth } from '../utils/month.js';
import { CATEGORIES } from '../utils/categories.js';

interface SeedFile {
  workspaceName: string;
  currency: string;
  members: { username: string; displayName: string; relationship: string; passwordEnv: string; incomeSources: { source: string; amount: number; expectedDay: number }[] }[];
  commitments: { title: string; category: string; customCategory?: string; type: 'personal' | 'common'; owner?: string; amount: number; dueDay?: number; startMonth?: string; endMonth?: string }[];
}

export async function seed(opts: { resetPasswords?: boolean; file?: string; log?: (s: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const file = opts.file ?? path.resolve(process.cwd(), 'seed/initial-data.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SeedFile;

  for (const c of data.commitments) {
    if (!(CATEGORIES as readonly string[]).includes(c.category)) throw new Error(`Unknown category "${c.category}" in ${c.title}`);
  }

  const existingUsers = await User.find({ username: { $in: data.members.map((m) => m.username) } });
  if (existingUsers.length === data.members.length) {
    log('Workspace and users already exist — nothing to create.');
    if (opts.resetPasswords) {
      for (const m of data.members) {
        const pw = process.env[m.passwordEnv];
        if (!pw) throw new Error(`Set ${m.passwordEnv} to reset ${m.username}'s password`);
        await User.updateOne({ username: m.username }, { $set: { passwordHash: await hashPassword(pw) } });
        log(`Password reset for ${m.username}`);
      }
    }
    return { created: false, workspaceId: String(existingUsers[0].workspaceId) };
  }
  if (existingUsers.length > 0) throw new Error('Some seed users exist but not all. Fix the database manually or restore a backup.');

  const passwords = data.members.map((m) => {
    const pw = process.env[m.passwordEnv];
    if (!pw || pw.length < 8) throw new Error(`Set ${m.passwordEnv} (min 8 characters) in server/.env.local before seeding`);
    return pw;
  });

  const startMonth = currentMonth();
  const workspaceId = new Types.ObjectId();
  const users = await Promise.all(
    data.members.map(async (m, i) => ({
      _id: new Types.ObjectId(),
      username: m.username.toLowerCase(),
      passwordHash: await hashPassword(passwords[i]),
      displayName: m.displayName,
      relationship: m.relationship,
      workspaceId,
    })),
  );
  await Workspace.create({
    _id: workspaceId,
    name: data.workspaceName,
    currency: data.currency ?? 'AED',
    startMonth,
    setupCompleted: false,
    members: data.members.map((m, i) => ({
      userId: users[i]._id,
      displayName: m.displayName,
      relationship: m.relationship,
      incomeSources: m.incomeSources.map((s) => ({ ...s, key: new Types.ObjectId().toHexString(), active: true })),
    })),
  });
  await User.insertMany(users);

  const byUsername = new Map(users.map((u) => [u.username, u._id]));
  await Commitment.insertMany(
    data.commitments.map((c) => {
      const start = c.startMonth ?? startMonth;
      const owner = c.type === 'personal' ? byUsername.get((c.owner ?? '').toLowerCase()) : undefined;
      if (c.type === 'personal' && !owner) throw new Error(`Commitment "${c.title}" has unknown owner "${c.owner}"`);
      return {
        workspaceId, title: c.title, category: c.category, customCategory: c.customCategory ?? '', type: c.type,
        ownerId: owner, amountHistory: [{ fromMonth: start, amount: c.amount }], startMonth: start,
        endMonth: c.endMonth ?? null, dueDay: c.dueDay ?? 1, createdBy: users[0]._id,
      };
    }),
  );
  log(`Created workspace "${data.workspaceName}" in database "${env.mongoDb}" with users: ${users.map((u) => u.username).join(', ')}`);
  log(`Seeded ${data.commitments.length} commitments starting ${startMonth}. Sign in to finish the setup wizard.`);
  return { created: true, workspaceId: String(workspaceId) };
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seed.ts')) {
  connectDB()
    .then(() => seed({ resetPasswords: process.argv.includes('--reset-passwords') }))
    .then(() => disconnectDB())
    .catch(async (err) => {
      console.error('Seed failed:', err.message);
      await disconnectDB().catch(() => undefined);
      process.exit(1);
    });
}
