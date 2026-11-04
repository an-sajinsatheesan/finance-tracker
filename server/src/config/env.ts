import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Load .env.local first (local dev), then .env. Values already set in the
// process (e.g. Vercel project settings) are never overridden.
for (const file of ['.env.local', '.env']) {
  const p = path.resolve(process.cwd(), file);
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  get nodeEnv() { return process.env.NODE_ENV ?? 'development'; },
  get isProd() { return this.nodeEnv === 'production'; },
  get port() { return Number(process.env.PORT ?? 5000); },
  get mongoUri() { return required('MONGODB_URI'); },
  get mongoDb() { return process.env.MONGODB_DB ?? 'finance_dev'; },
  get jwtSecret() {
    const s = required('JWT_SECRET');
    if (s.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    return s;
  },
  get jwtExpiresIn() { return process.env.JWT_EXPIRES_IN ?? '7d'; },
  get clientOrigins() {
    return (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);
  },
  get timezone() { return process.env.APP_TIMEZONE ?? 'Asia/Dubai'; },
  /** Public URL of the frontend, used in invitation and reminder emails. */
  get appUrl() { return (process.env.APP_URL ?? this.clientOrigins[0]).replace(/\/$/, ''); },
  get smtp() {
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    return {
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    };
  },
  get mailFrom() { return process.env.MAIL_FROM ?? 'Household Finance <no-reply@localhost>'; },
  /** Shared secret for the scheduled reminder endpoint (Vercel Cron sends it as a Bearer token). */
  get cronSecret() { return process.env.CRON_SECRET ?? ''; },
  get allowRegistration() { return process.env.ALLOW_REGISTRATION !== 'false'; },
  /** AI chat. Without OPENAI_API_KEY the chat page says it isn't set up. */
  get openaiApiKey() { return process.env.OPENAI_API_KEY ?? ''; },
  get openaiModel() { return process.env.OPENAI_MODEL ?? 'gpt-6-luna'; },
  get aiDailyLimit() { return Number(process.env.AI_DAILY_LIMIT ?? 30); },
  get backupDir() { return process.env.BACKUP_DIR ?? path.resolve(process.cwd(), 'backups'); },
};
