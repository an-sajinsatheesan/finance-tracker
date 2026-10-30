// Vercel serverless entry point. The Express app is reused across warm invocations
// and the MongoDB connection is cached on globalThis (see src/config/db.ts).
import { createApp } from '../src/app.js';

const app = createApp();
export default app;
