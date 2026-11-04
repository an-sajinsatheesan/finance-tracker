/**
 * Creates the admin panel sign-in in the database, or gives an existing one a new password
 * (which also signs it out everywhere). Prints a generated password once; only its hash is stored.
 *
 *   npm run admin:create -- <username>
 *
 * Uses the database in MONGODB_DB, so for live data run it with MONGODB_DB=finance_prod.
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Admin } from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';

async function main() {
  const username = (process.argv[2] ?? 'admin').toLowerCase().trim();
  await connectDB();
  await Admin.init();
  const password = crypto.randomBytes(15).toString('base64url');
  const existing = await Admin.exists({ username });
  await Admin.updateOne(
    { username },
    { $set: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() } },
    { upsert: true },
  );
  console.log(`${existing ? 'New password set' : 'Admin created'} in database "${env.mongoDb}"`);
  console.log(`Username: ${username}`);
  console.log(`Password: ${password}`);
}

main()
  .then(() => disconnectDB())
  .catch(async (err) => {
    console.error('Could not create the admin:', err.message);
    await disconnectDB().catch(() => undefined);
    process.exit(1);
  });
