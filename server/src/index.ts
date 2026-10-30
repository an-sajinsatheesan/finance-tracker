import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

async function main() {
  await connectDB();
  console.log(`MongoDB connected (database: ${env.mongoDb})`);
  createApp().listen(env.port, () => console.log(`API listening on http://localhost:${env.port}/api`));
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
