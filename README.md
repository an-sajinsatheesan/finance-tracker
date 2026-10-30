# Household Finance Tracker

A personal finance app for two people (Sajin & Abhirami) sharing one workspace.
React + TypeScript + Vite frontend, Express + TypeScript API, MongoDB Atlas (Mongoose), JWT + bcrypt auth.

Runs locally first; deploying to Vercel later needs configuration only (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

```text
finance-tracker/
├── client/                 React frontend (Vite, Tailwind CSS, Recharts, Lucide)
├── server/                 Express API
│   ├── api/index.ts        Vercel serverless entry (reuses the same Express app)
│   ├── seed/initial-data.json   Users, income and initial commitments for `npm run seed`
│   ├── src/
│   │   ├── config/         env loading + cached MongoDB connection
│   │   ├── models/         Mongoose schemas
│   │   ├── repositories/   workspace-scoped data access
│   │   ├── services/       business rules (summary.logic.ts holds all calculations)
│   │   ├── controllers/    HTTP handlers
│   │   ├── routes/         API routes
│   │   ├── middleware/     auth, validation, errors, rate limit
│   │   ├── scripts/        seed, backup, restore
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
SEED_SAJIN_PASSWORD=...
SEED_ABHIRAMI_PASSWORD=...
```

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

## 5. Initialize the two users and the workspace

```powershell
npm run seed
```

This creates:

- the shared workspace,
- users `sajin` (Husband) and `abhirami` (Wife), with passwords hashed using bcrypt and taken from `SEED_*_PASSWORD`,
- monthly income: Sajin AED 11,500, Abhirami AED 9,000,
- the initial commitments from `server/seed/initial-data.json`.

**Edit `server/seed/initial-data.json` before seeding** to put in your real commitments. The ones included are placeholders. They are *planned* commitments, not recorded expenses. You can also adjust them in the setup wizard.

The seed is safe to re-run; it never duplicates or overwrites data. To change passwords later, edit the `SEED_*` values and run `npm run seed -- --reset-passwords`.

## 6. Start the app

```powershell
npm run dev
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:5000/api> (health check: `/api/health`)

Sign in as `sajin` or `abhirami`. The first sign-in opens the **4-step setup** (workspace & members → income → commitments → review & confirm). After that, both of you can sign in from any device that can reach the API and you'll see the same live data.

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

- The app has no "delete database", "delete workspace" or "delete record" feature. Expenses, income and goal allocations are **archived** and can be restored. Commitments are **ended**, not deleted.
- Every API query is scoped to the signed-in user's workspace (workspace-level authorization).
- Restore runs inside a MongoDB transaction on Atlas. If it fails, the pre-restore snapshot is put back.

## Financial rules

All calculations live in `server/src/services/summary.logic.ts` (unit tested).

- A **personal** expense belongs to one person (by default, whoever paid it).
- A **common** expense is split 50/50 when it's recorded. Shares are stored on the expense, add up exactly to its amount (to the fil), and are never counted twice.
- **Commitments** are planned amounts. **Expenses** are what was actually spent. "Mark paid" on a commitment records a linked expense for that month.
- **Expected** and **received** income are tracked separately. A month's expected income is created once, from the income sources, the first time that month is opened (from the start month up to next month).
- **Cash left** = received income − actual outflow (personal expenses + my share of common).
- **Not yet allocated** = cash left − goal allocations.
- **History is preserved**: a changed commitment amount applies from a chosen month onward, and editing income sources never rewrites months that already exist.
- The **month selector** drives every screen.

## Tests

```powershell
npm test                       # calculation unit tests
```

The API end-to-end tests (auth, workspace isolation, splits, summary, backup round trip) run against a real database and **only** use a database called `finance_test`:

```powershell
$env:TEST_MONGODB_URI="mongodb+srv://..."; npm test
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (port 5000) + frontend (port 5173) with reload |
| `npm run seed` | Create workspace + users + initial commitments |
| `npm run backup` / `npm run restore -- <file>` | JSON backup / restore |
| `npm test` | Tests |
| `npm run build` | Production build of both apps |
| `npm run typecheck` | TypeScript checks |
