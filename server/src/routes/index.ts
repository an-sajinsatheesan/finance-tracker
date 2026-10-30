import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody as body, validateQuery as query } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as v from '../utils/validation.js';
import * as auth from '../controllers/auth.controller.js';
import * as workspace from '../controllers/workspace.controller.js';
import * as income from '../controllers/income.controller.js';
import * as commitments from '../controllers/commitment.controller.js';
import * as expenses from '../controllers/expense.controller.js';
import * as goals from '../controllers/goal.controller.js';
import * as summary from '../controllers/summary.controller.js';
import * as backup from '../controllers/backup.controller.js';

export const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

router.post('/auth/login', rateLimit(10, 10 * 60 * 1000), body(v.loginSchema), h(auth.login));

// Everything below requires a valid JWT; all data access is scoped to the user's workspace.
router.use(requireAuth);

router.get('/auth/me', h(auth.me));

router.get('/workspace', h(workspace.get));
router.put('/workspace', body(v.workspaceUpdateSchema), h(workspace.update));
router.post('/workspace/setup/complete', body(v.completeSetupSchema), h(workspace.completeSetup));

router.get('/income', query(v.monthQuery), h(income.list));
router.post('/income', body(v.incomeCreateSchema), h(income.create));
router.put('/income/:id', body(v.incomeUpdateSchema), h(income.update));
router.post('/income/:id/archive', h(income.archive));
router.post('/income/:id/unarchive', h(income.unarchive));

router.get('/commitments', h(commitments.list));
router.post('/commitments', body(v.commitmentCreateSchema), h(commitments.create));
router.put('/commitments/:id', body(v.commitmentUpdateSchema), h(commitments.update));
router.post('/commitments/:id/end', body(v.commitmentEndSchema), h(commitments.end));
router.post('/commitments/:id/reactivate', h(commitments.reactivate));
router.post('/commitments/:id/archive', h(commitments.archive));
router.post('/commitments/:id/pay', body(v.commitmentPaySchema), h(commitments.pay));

router.get('/expenses', query(v.monthQuery.passthrough()), h(expenses.list));
router.post('/expenses', body(v.expenseCreateSchema), h(expenses.create));
router.put('/expenses/:id', body(v.expenseUpdateSchema), h(expenses.update));
router.post('/expenses/:id/archive', h(expenses.archive));
router.post('/expenses/:id/unarchive', h(expenses.unarchive));

router.get('/goals', h(goals.list));
router.post('/goals', body(v.goalCreateSchema), h(goals.create));
router.put('/goals/:id', body(v.goalUpdateSchema), h(goals.update));
router.get('/goal-allocations', h(goals.listAllocations));
router.post('/goals/:id/allocations', body(v.allocationCreateSchema), h(goals.allocate));
router.post('/goal-allocations/:id/archive', h(goals.archiveAllocation));

router.get('/summary', query(v.summaryQuery), h(summary.summary));

router.get('/backup/export', h(backup.exportJson));
router.post('/backup/validate', h(backup.validate));
router.post('/backup/restore', h(backup.restore));
router.post('/backup/snapshots', h(backup.snapshot));
router.get('/backup/snapshots', h(backup.listSnapshots));
router.get('/backup/snapshots/:id', h(backup.downloadSnapshot));
// Intentionally no routes to delete the database, the workspace or any financial record.
