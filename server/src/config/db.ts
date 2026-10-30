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

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env.mongoUri, {
        dbName: env.mongoDb,
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        bufferCommands: false,
      })
      .catch((err) => {
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
