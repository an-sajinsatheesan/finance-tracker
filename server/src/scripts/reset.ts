/**
 * Empties the configured database and re-seeds only the lookup tables, giving
 * a fresh app with no users or financial data. Irreversible, so it requires the
 * database name to be repeated, and backs up any workspaces first.
 *
 *   MONGODB_DB=finance_prod npm run reset -- --confirm finance_prod
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Workspace } from '../models/index.js';
import { exportWorkspace } from '../services/backup.service.js';
import { seed } from './seed.js';

async function main() {
  const i = process.argv.indexOf('--confirm');
  const confirmed = i > -1 ? process.argv[i + 1] : undefined;
  if (confirmed !== env.mongoDb) {
    throw new Error(`This deletes everything in "${env.mongoDb}". Re-run with --confirm ${env.mongoDb}`);
  }

  await connectDB();
  const workspaces = await Workspace.find().lean();
  if (workspaces.length) fs.mkdirSync(env.backupDir, { recursive: true });
  for (const ws of workspaces) {
    const file = path.join(env.backupDir, `finance-backup-${env.mongoDb}-before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(await exportWorkspace(String(ws._id)), null, 2));
    console.log(`Backup written: ${file}`);
  }

  await mongoose.connection.db!.dropDatabase();
  console.log(`Database "${env.mongoDb}" emptied.`);
  await mongoose.syncIndexes(); // dropping the database also dropped the unique indexes
  await seed();
}

main()
  .then(() => disconnectDB())
  .catch(async (err) => {
    console.error('Reset failed:', err.message);
    await disconnectDB().catch(() => undefined);
    process.exit(1);
  });
