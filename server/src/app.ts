import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { router } from './routes/index.js';
import { ensureLookupsOnce } from './services/lookup.service.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin / server-to-server (no Origin header) and configured origins.
        if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
    }),
  );
  app.use(express.json({ limit: '10mb' })); // backups can be a few MB
  // Lazily connect (works for both a long-running server and serverless functions).
  app.use(async (_req, _res, next) => {
    try {
      await connectDB();
      await ensureLookupsOnce(); // enum rows must exist before anything validates against them
      next();
    } catch (err) {
      next(err);
    }
  });
  app.use('/api', router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
