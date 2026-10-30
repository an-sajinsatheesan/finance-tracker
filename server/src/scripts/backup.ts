/** npm run backup — writes a full JSON backup of the workspace to server/backups/. */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Workspace } from '../models/index.js';
import { exportWorkspace } from '../services/backup.service.js';

async function main() {
  await connectDB();
  const workspaces = await Workspace.find().lean();
  if (!workspaces.length) throw new Error('No workspace found. Run npm run seed first.');
  fs.mkdirSync(env.backupDir, { recursive: true });
  for (const ws of workspaces) {
    const data = await exportWorkspace(String(ws._id));
    const file = path.join(env.backupDir, `finance-backup-${env.mongoDb}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`Backup written: ${file}`);
    console.log(`Records: ${JSON.stringify(data.counts)}`);
  }
}

main()
  .then(() => disconnectDB())
  .catch(async (err) => {
    console.error('Backup failed:', err.message);
    await disconnectDB().catch(() => undefined);
    process.exit(1);
  });
