# Deploying to Vercel + MongoDB Atlas

The code doesn't change for production. You deploy the same repository as **two Vercel projects**: one for the API (`server/`) and one for the frontend (`client/`). Only the environment variables differ.

## 0. Before you start

- Push the repo to GitHub (`.env.local` files and `server/backups/` are git-ignored).
- In Atlas → Network Access, allow `0.0.0.0/0` (Vercel functions have no fixed IPs).
- Decide on the production database: `MONGODB_DB=finance_prod`.

## 1. Production data

Nothing needs seeding by hand: the API inserts the enum (lookup) rows on its first request. (`npm run seed` with `MONGODB_DB=finance_prod` does the same from your PC.) Users register in the app.

To move dev data into prod, register in prod first, then use Settings → Backup & restore (or `npm run backup` against dev and `npm run restore -- <file>` against prod). Users are matched by username/email.

## 2. API project (server)

Vercel → *Add New Project* → import the repo:

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Framework Preset | Other |
| Build Command | *(leave empty)* |
| Output Directory | *(leave empty)* |

Environment variables (Production):

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Atlas connection string (prod user) |
| `MONGODB_DB` | `finance_prod` |
| `JWT_SECRET` | a **new** long random secret (not the dev one) |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_ORIGIN` | `https://<your-frontend>.vercel.app` (comma-separate several) |
| `APP_TIMEZONE` | `Asia/Dubai` |
| `APP_URL` | `https://<your-frontend>.vercel.app` (links in emails) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | your mail provider (partner invitations, bill reminders) |
| `CRON_SECRET` | long random string. Vercel Cron sends it to `/api/cron/reminders` daily at 08:00 Dubai (`server/vercel.json`) |
| `ALLOW_REGISTRATION` | `false` once you've both registered, to stop strangers signing up |

`server/api/index.ts` exports the Express app, and `server/vercel.json` routes `/api/*` to it. The MongoDB connection is cached on `globalThis` with a small pool (`maxPoolSize: 10`), so warm invocations reuse it instead of opening new connections. This keeps you well within the M0 connection limit.

Check: `https://<your-api>.vercel.app/api/health` → `{"ok":true}`.

## 3. Frontend project (client)

Add another project from the same repo:

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Environment variable:

| Name | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<your-api>.vercel.app/api` |

`client/vercel.json` rewrites all paths to `index.html` so routes like `/expenses` work on refresh.

## 4. After deploying

1. Add the frontend URL to the API's `CLIENT_ORIGIN` and redeploy the API.
2. Register, invite your partner, and sign in on both phones. Data is live and shared through the API.
3. Export a backup from Settings and keep it somewhere safe. Do this regularly, since Atlas M0 has no automated backups.

## Local vs production configuration

| | Local | Production |
|---|---|---|
| API env | `server/.env.local` | Vercel project env vars |
| Client env | `client/.env.local` | Vercel project env vars |
| Database | `finance_dev` | `finance_prod` |
| Template | `server/.env.example`, `client/.env.example` | — |

Nothing in the code hardcodes `localhost` or a production URL. The API base URL and allowed origins all come from environment variables.
