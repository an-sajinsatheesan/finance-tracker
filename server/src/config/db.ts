import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Cached connection. In serverless (Vercel) the module may be re-used across
 * invocations, so we keep the connection on globalThis and never open a
 * second pool for a warm function.
 */
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { __mongooseCache?: Cache };
const cache: Cache = (g.__mongooseCache ??= { conn: null, promise: null });

mongoose.set('strictQuery', true);

// Optional: force specific DNS servers (comma-separated), e.g. MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8
const customDns = process.env.MONGODB_DNS_SERVERS?.split(',').map((s) => s.trim()).filter(Boolean);
if (customDns?.length) dns.setServers(customDns);

const PUBLIC_DNS = ['1.1.1.1', '8.8.8.8'];

/**
 * mongodb+srv:// URIs need a DNS SRV lookup. On some Windows/home-router setups
 * Node's resolver refuses SRV queries (querySrv ECONNREFUSED) even though the
 * internet works. In that case we retry once using public DNS servers.
 */
function isSrvDnsError(err: unknown) {
  const e = err as { code?: string; syscall?: string; message?: string };
  return (
    (e?.syscall === 'querySrv' || e?.syscall === 'queryTxt' || /querySrv|queryTxt/.test(String(e?.message))) &&
    ['ECONNREFUSED', 'ETIMEOUT', 'ESERVFAIL', 'ENOTFOUND', 'EREFUSED'].includes(String(e?.code))
  );
}

const options = {
  dbName: env.mongoDb,
  maxPoolSize: 10,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  bufferCommands: false,
} as const;

async function connectWithDnsFallback() {
  try {
    return await mongoose.connect(env.mongoUri, options);
  } catch (err) {
    if (!isSrvDnsError(err) || customDns?.length) throw err;
    console.warn(`DNS SRV lookup failed (${(err as Error).message}). Retrying with public DNS ${PUBLIC_DNS.join(', ')}…`);
    dns.setServers(PUBLIC_DNS);
    return mongoose.connect(env.mongoUri, options);
  }
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (!cache.promise) {
    cache.promise = connectWithDnsFallback().catch((err) => {
      cache.promise = null;
      throw err;
    });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
}
