/**
 * Seeds the enum (Lookup) table: relationships, currencies, income sources,
 * statuses, categories, banks and account types. No users or financial data
 * are created — people register in the app. Safe to run more than once:
 * existing rows (including renamed labels) are kept.
 *
 *   npm run seed
 */
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { ensureLookups } from '../services/lookup.service.js';

export async function seed(opts: { log?: (s: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const added = await ensureLookups();
  log(`Lookups ready in database "${env.mongoDb}" (${added} new row${added === 1 ? '' : 's'}).`);
  return { added };
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seed.ts')) {
  connectDB()
    .then(() => seed())
    .then(() => disconnectDB())
    .catch(async (err) => {
      console.error('Seed failed:', err.message);
      await disconnectDB().catch(() => undefined);
      process.exit(1);
    });
}
