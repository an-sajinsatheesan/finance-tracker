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
import * as lookups from '../controllers/lookup.controller.js';
import * as accounts from '../controllers/account.controller.js';
import * as reminders from '../controllers/reminder.controller.js';
import * as contracts from '../controllers/contract.controller.js';
import * as gold from '../controllers/gold.controller.js';
import * as loans from '../controllers/loan.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as ai from '../controllers/ai.controller.js';
import { requireAdmin } from '../middleware/admin.js';

export const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

router.post('/auth/login', rateLimit(10, 10 * 60 * 1000), body(v.loginSchema), h(auth.login));
router.post('/auth/register', rateLimit(5, 60 * 60 * 1000), body(v.registerSchema), h(auth.register));
router.get('/invitations/:token', rateLimit(30, 10 * 60 * 1000), h(auth.describeInvite));
router.post('/invitations/:token/accept', rateLimit(10, 10 * 60 * 1000), body(v.acceptInviteSchema), h(auth.acceptInvite));
// Daily reminder emails, called by Vercel Cron with the CRON_SECRET bearer token.
router.get('/cron/reminders', h(reminders.cron));
router.post('/cron/reminders', h(reminders.cron));

// Admin panel (user control): its own sign-in from the admins collection (npm run admin:create).
router.post('/admin/login', rateLimit(10, 10 * 60 * 1000), body(v.adminLoginSchema), h(admin.login));
router.get('/admin/users', requireAdmin, h(admin.users));
router.get('/admin/users/:id', requireAdmin, h(admin.userDetails));
router.put('/admin/users/:id', requireAdmin, body(v.adminUserUpdateSchema), h(admin.updateUser));
router.put('/admin/users/:id/password', requireAdmin, body(v.adminPasswordSchema), h(admin.setPassword));
router.delete('/admin/users/:id', requireAdmin, h(admin.deleteUser));

// Everything below requires a valid JWT; all data access is scoped to the user's workspace.
router.use(requireAuth);

router.get('/auth/me', h(auth.me));
router.put('/auth/me', body(v.profileUpdateSchema), h(auth.updateProfile));

router.get('/workspace', h(workspace.get));
router.put('/workspace', body(v.workspaceUpdateSchema), h(workspace.update));
router.post('/workspace/setup/complete', body(v.completeSetupSchema), h(workspace.completeSetup));
router.get('/workspace/invitations', h(workspace.listInvitations));
router.post('/workspace/invitations', body(v.invitePartnerSchema), h(workspace.invitePartner));
router.post('/workspace/invitations/:id/resend', h(workspace.resendInvitation));
router.post('/workspace/members/:userId/reinvite', body(v.reinviteSchema), h(workspace.reinviteMember));

router.get('/lookups', h(lookups.list));
router.post('/lookups', body(v.lookupCreateSchema), h(lookups.create));
router.put('/lookups/:id', body(v.lookupUpdateSchema), h(lookups.update));

router.get('/income', query(v.monthQuery), h(income.list));
router.post('/income', body(v.incomeCreateSchema), h(income.create));
router.put('/income/:id', body(v.incomeUpdateSchema), h(income.update));
router.post('/income/:id/archive', h(income.archive));
router.post('/income/:id/unarchive', h(income.unarchive));
router.post('/income/sync', body(v.monthQuery), h(income.sync));

router.get('/commitments', h(commitments.list));
router.post('/commitments', body(v.commitmentCreateSchema), h(commitments.create));
router.put('/commitments/:id', body(v.commitmentUpdateSchema), h(commitments.update));
router.post('/commitments/:id/end', body(v.commitmentEndSchema), h(commitments.end));
router.post('/commitments/:id/reactivate', h(commitments.reactivate));
router.post('/commitments/:id/archive', h(commitments.archive));
router.post('/commitments/:id/pay', body(v.commitmentPaySchema), h(commitments.pay));
router.post('/commitments/:id/shares', body(v.commitmentShareSchema), h(commitments.sendShare));
router.delete('/commitments/:id/shares/:shareId', h(commitments.cancelShare));
router.delete('/commitments/:id', h(commitments.remove));
router.get('/reminders', h(reminders.list));

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

router.get('/accounts', h(accounts.list));
router.post('/accounts', body(v.accountCreateSchema), h(accounts.create));
router.put('/accounts/:id', body(v.accountUpdateSchema), h(accounts.update));
router.get('/accounts/:id/balances', h(accounts.history));
router.get('/contracts', h(contracts.list));
router.post('/contracts', body(v.contractCreateSchema), h(contracts.create));
router.put('/contracts/:id', body(v.contractUpdateSchema), h(contracts.update));
router.post('/contracts/:id/renew', body(v.contractRenewSchema), h(contracts.renew));
router.post('/contracts/:id/archive', h(contracts.archive));
router.put('/contracts/:id/cheques/:chequeId', body(v.chequeSchema), h(contracts.setCheque));
router.post('/deposits', body(v.depositCreateSchema), h(contracts.createDeposit));
router.put('/deposits/:id', body(v.depositUpdateSchema), h(contracts.updateDeposit));
router.get('/gold', h(gold.list));
router.post('/gold', body(v.goldItemCreateSchema), h(gold.create));
router.put('/gold/price', body(v.goldPriceSchema), h(gold.setPrice));
router.put('/gold/:id', body(v.goldItemUpdateSchema), h(gold.update));
router.get('/loans/:accountId', h(loans.get));
router.post('/loans/:accountId/entries', body(v.loanEntriesSchema), h(loans.add));
router.put('/loans/:accountId/entries/:id', body(v.loanEntrySchema), h(loans.update));
router.post('/loans/:accountId/entries/:id/archive', h(loans.remove));
router.put('/account-balances', body(v.balancesSaveSchema), h(accounts.saveBalances));
router.get('/transfers', query(v.monthQuery), h(accounts.listTransfers));
router.post('/transfers', body(v.transferCreateSchema), h(accounts.createTransfer));
router.post('/transfers/:id/archive', h(accounts.archiveTransfer));
router.get('/wealth', query(v.wealthQuery), h(accounts.wealth));
router.get('/balances', query(v.monthQuery), h(accounts.balances));

router.post('/ai/chat', body(v.aiChatSchema), h(ai.chat));

router.get('/backup/export', h(backup.exportJson));
router.post('/backup/validate', h(backup.validate));
router.post('/backup/restore', h(backup.restore));
router.post('/backup/snapshots', h(backup.snapshot));
router.get('/backup/snapshots', h(backup.listSnapshots));
router.get('/backup/snapshots/:id', h(backup.downloadSnapshot));
// Intentionally no routes to delete the database, the workspace or recorded money (expenses, income,
// balances are archived instead). Only planned commitments can be deleted. The one exception is the
// admin panel's user delete above, which removes a workspace along with the last person in it.
