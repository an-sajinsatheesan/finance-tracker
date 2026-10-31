/**
 * npm run restore -- <path-to-backup.json> [--yes]
 * Validates the file, saves a pre-restore backup to server/backups/, then restores.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Workspace } from '../models/index.js';
import { exportWorkspace, restoreWorkspace, validateBackup } from '../services/backup.service.js';

async function main() {
  const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!fileArg) throw new Error('Usage: npm run restore -- <path-to-backup.json> [--yes]');
  const file = path.resolve(process.env.INIT_CWD ?? process.cwd(), fileArg);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

  await connectDB();
  const ws = await Workspace.findOne().sort({ createdAt: 1 }).lean();
  if (!ws) throw new Error('No workspace found. Register in the app first.');
  const workspaceId = String(ws._id);

  const report = await validateBackup(raw, workspaceId);
  if (!report.valid) {
    console.error('Backup is NOT valid:\n - ' + report.errors.join('\n - '));
    process.exitCode = 1;
    return;
  }
  console.log(`Backup OK — exported ${report.summary?.exportedAt}, schema v${report.summary?.schemaVersion}`);
  console.log(`Records: ${JSON.stringify(report.summary?.counts)}`);
  console.log(`Target database: ${env.mongoDb}`);

  if (!process.argv.includes('--yes')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('This replaces the current workspace data. Type RESTORE to continue: ');
    rl.close();
    if (answer.trim() !== 'RESTORE') {
      console.log('Cancelled.');
      return;
    }
  }

  fs.mkdirSync(env.backupDir, { recursive: true });
  const pre = path.join(env.backupDir, `pre-restore-${env.mongoDb}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(pre, JSON.stringify(await exportWorkspace(workspaceId), null, 2));
  console.log(`Pre-restore backup written: ${pre}`);

  const result = await restoreWorkspace(workspaceId, raw);
  console.log(`Restore complete. (Server-side snapshot id: ${result.preRestoreBackupId})`);
}

main()
  .then(() => disconnectDB())
  .catch(async (err) => {
    console.error('Restore failed:', err.message);
    await disconnectDB().catch(() => undefined);
    process.exit(1);
  });
