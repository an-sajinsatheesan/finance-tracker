# Household Finance Tracker

A finance app for one person or a couple sharing one workspace: income, expenses, recurring commitments with bill reminders, bank accounts in AED and INR, transfers and a wealth dashboard.
React + TypeScript + Vite frontend, Express + TypeScript API, MongoDB Atlas (Mongoose), JWT + bcrypt auth.

Runs locally first; deploying to Vercel later needs configuration only (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

```text
finance-tracker/
├── client/                 React frontend (Vite, Tailwind CSS, Recharts, Lucide)
├── server/                 Express API
│   ├── api/index.ts        Vercel serverless entry (reuses the same Express app)
│   ├── src/
│   │   ├── config/         env loading + cached MongoDB connection
│   │   ├── models/         Mongoose schemas
│   │   ├── repositories/   workspace-scoped data access
│   │   ├── services/       business rules (summary.logic.ts holds all calculations)
│   │   ├── controllers/    HTTP handlers
│   │   ├── routes/         API routes
│   │   ├── middleware/     auth, validation, errors, rate limit
│   │   ├── scripts/        seed (enums), backup, restore
│   │   └── utils/
│   └── .env.example
└── docs/DEPLOYMENT.md
```

---

## 1. Create a MongoDB Atlas free cluster

1. Sign in at <https://cloud.mongodb.com> and create a project (e.g. *Finance Tracker*).
2. **Create** → **M0 Free** cluster. Pick a region close to you (e.g. AWS / Bahrain `me-south-1` or Frankfurt). Name it `finance`.
3. You don't need to create the databases by hand. `finance_dev` and `finance_prod` are created automatically the first time the app writes to them.

## 2. Database users and network access

**Database user** (Security → *Database Access* → *Add New Database User*):

| Setting | Value |
|---|---|
| Authentication | Password |
| Username | `finance_app` (any name) |
| Password | Click *Autogenerate*, copy it somewhere safe |
| Built-in role | *Read and write to any database* (or a custom role limited to `finance_dev` and `finance_prod`) |

Tip: you can create two users, `finance_dev_app` and `finance_prod_app`, each with `readWrite` on only its own database. Then a dev key can never touch live data.

**Network access** (Security → *Network Access* → *Add IP Address*):

- For local development: **Add Current IP Address**. If your home IP changes, add the new one.
- For Vercel later: Vercel has no fixed IPs, so allow `0.0.0.0/0` (access from anywhere). The strong database password is what protects the data.

**Connection string**: Cluster → **Connect** → *Drivers* → Node.js. Copy the string. It looks like:

```
mongodb+srv://finance_app:<password>@finance.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=finance
```

If the password has special characters (`@ : / ? # %`), URL-encode them (e.g. `@` → `%40`).

## 3. Connect the local backend

```powershell
cd finance-tracker
copy server\.env.example server\.env.local
copy client\.env.example client\.env.local
```

Edit `server/.env.local`:

```ini
MONGODB_URI=mongodb+srv://finance_app:<password>@finance.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=finance
MONGODB_DB=finance_dev
JWT_SECRET=<48+ random characters>
CLIENT_ORIGIN=http://localhost:5173
```

Optional: `SMTP_*` and `MAIL_FROM` to email partner invitations and bill reminders (see `server/.env.example`). Without SMTP the email is printed to the server log and the app shows the invitation link so you can share it yourself.

Generate a JWT secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`client/.env.local` only holds `VITE_API_BASE_URL=http://localhost:5000/api`. No secrets ever go in the client. MongoDB credentials and the JWT secret live only on the server.

## 4. Install dependencies

Requires **Node.js 20 or newer** (`node -v`).

```powershell
npm install
```

npm workspaces install both `client` and `server` with this one command, run from the project root.

## 5. Seed the enum table

```powershell
npm run seed
```

The seed creates **only enums**, all in one `lookups` collection (`type` + `code` + `label` + `meta`): relationships, workspace modes, member statuses, currencies (AED, INR, USD), income sources, income/commitment/expense/goal statuses, commitment types, categories, banks (ENBD, RAK, EIB, ADCB, FAB, SBI, Federal, HDFC, ICICI, …) and account types (savings, FD, SIP, mutual fund, stocks, gold, loan, credit card, …). Each account type's `meta.group` (cash / deposit / investment / liability) drives the wealth dashboard.

No users or financial data are seeded. The API also inserts any missing enum rows on start, and the seed is safe to re-run (existing rows are left alone). A workspace can add its own values (a new bank, category, income source…) from the app; those rows carry the workspace id.

## 6. Start the app

```powershell
npm run dev
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:5000/api> (health check: `/api/health`)

Open the app and **Register**. Choose *Just me* (personal) or *A couple*. For a couple, enter your partner's name and (optionally) email: your partner is added straight away as an *invited* member, so common expenses split 50/50 from day one, and the invitation email is sent once your registration is complete. Your partner opens the link, chooses a password and joins the same workspace. You can resend the invitation, or invite a partner later, from **Settings → Members**.

After registering, the **4-step setup** opens (workspace & members → recurring income → commitments → review & confirm). Sign-in is by email (accounts created before email sign-in can still use their username).

To try it from your phone on the same Wi-Fi, run `npm run dev -w client -- --host`. Then set `VITE_API_BASE_URL=http://<your-pc-ip>:5000/api` in `client/.env.local` and add `http://<your-pc-ip>:5173` to `CLIENT_ORIGIN`.

## 7. Backups and restore

Backups are plain JSON files containing a timestamp (`exportedAt`), a `schemaVersion`, and the whole workspace. Password hashes are never included. Backups don't depend on Vercel or Atlas, so you can restore them into any MongoDB.

**From the app** (Settings → Backup & restore):

- **Export backup** downloads `finance-backup-<timestamp>.json`.
- **Restore from file…** validates the file first (structure, schema version, references, share totals) and shows what it contains. You then confirm by typing `RESTORE`. A snapshot of the current data is saved automatically before the restore and is listed under *Server snapshots*, so you can undo.

**From the command line** (uses the database in `server/.env.local`):

```powershell
npm run backup                                        # → server/backups/finance-backup-<db>-<timestamp>.json
npm run restore -- server/backups/<file>.json         # asks you to type RESTORE
```

`restore` also writes a `pre-restore-*.json` file before changing anything. `server/backups/` is git-ignored because it holds financial data, so copy backups to a safe place (cloud drive, external disk).

Atlas M0 has no automated backups, so export a backup regularly (e.g. monthly).

### Data protection

- The app has no "delete database" or "delete workspace" feature. Recorded money (expenses, income, goal allocations, transfers) is **archived** and can be restored. Commitments can be **ended** (stop from a month, keep history) or **deleted** when no longer needed (removed from every month's plan; payments already recorded stay as expenses).
- Every API query is scoped to the signed-in user's workspace (workspace-level authorization).
- Restore runs inside a MongoDB transaction on Atlas. If it fails, the pre-restore snapshot is put back.

## Financial rules

All calculations live in pure, unit-tested modules: `summary.logic.ts`, `wealth.logic.ts` and `reminder.logic.ts` in `server/src/services/`.

- A **personal** expense belongs to one person (by default, whoever paid it).
- A **common** expense is split 50/50 when it's recorded. Shares are stored on the expense, add up exactly to its amount (to the fil), and are never counted twice.
- **Commitments** are planned amounts. **Expenses** are what was actually spent. "Mark paid" on a commitment records a linked expense for that month.
- **Commitments** repeat every month automatically from their start month until their end month (or forever). Add new ones (a new car or mobile EMI) any time; end or delete ones you no longer need.
- **Reminders**: each commitment can remind you 0–7 days before its due day. Unpaid bills that are due soon or overdue show in the bell in the header; with SMTP and `CRON_SECRET` set, a daily email goes out too (`/api/cron/reminders`, scheduled in `server/vercel.json`).
- **Settle-up** ("X owes Y"): every common expense is split 50/50, so whoever *paid* more than their half is owed the difference. Pick the right *Paid by* when you mark a common commitment paid. The dashboard's "Why?" link shows the breakdown.
- **Expected** and **received** income are tracked separately. A month's expected income is created once, from the recurring income (Income → Recurring income), the first time that month is opened (from the start month up to next month).
- **Accounts & wealth**: each account (bank, deposit, SIP, stocks, loan…) has a currency and a month-end balance. A month without a balance carries the last one forward. Net worth = assets − loans, per currency (AED, INR), plus a combined figure in AED using the rate you set on the Wealth page. Transfers (e.g. AED → INR) keep both amounts, so the effective rate is known.
- **Cash left** = received income − actual outflow (personal expenses + my share of common).
- **Not yet allocated** = cash left − goal allocations.
- **History is preserved**: a changed commitment amount applies from a chosen month onward, and editing income sources never rewrites months that already exist.
- The **month selector** drives every screen.

## Tests

```powershell
npm test                       # calculation unit tests
```

The API end-to-end tests (registration & invitations, workspace isolation, lookups, splits, summary, commitments, accounts & wealth, backup round trip) run against a real database and **only** use a database called `finance_test`:

```powershell
$env:TEST_MONGODB_URI="mongodb+srv://..."; npm test
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (port 5000) + frontend (port 5173) with reload |
| `npm run seed` | Insert the enum (lookup) rows |
| `npm run backup` / `npm run restore -- <file>` | JSON backup / restore |
| `npm test` | Tests |
| `npm run build` | Production build of both apps |
| `npm run typecheck` | TypeScript checks |
