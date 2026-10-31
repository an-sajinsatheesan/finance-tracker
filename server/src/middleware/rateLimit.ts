import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';

/** Small in-memory limiter for the public auth routes (best effort; per instance). */
export function rateLimit(max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req, _res, next) => {
    const key = `${req.path}:${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return next(new AppError(429, 'Too many attempts. Try again in a few minutes.'));
    next();
  };
}
