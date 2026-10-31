import { env } from '../config/env.js';
import { addMonths, today as todayStr } from '../utils/month.js';
import { escapeHtml, sendMail } from '../utils/mailer.js';
import { Commitment, Expense, User, Workspace } from '../models/index.js';
import { computeReminders, type ReminderCommitment } from './reminder.logic.js';

async function loadData(workspaceId: string, today: string) {
  const thisMonth = today.slice(0, 7);
  const months = [thisMonth, addMonths(thisMonth, 1)];
  const [ws, commitments, payments] = await Promise.all([
    Workspace.findById(workspaceId).lean(),
    Commitment.find({ workspaceId, archived: false, startMonth: { $lte: months[1] }, $or: [{ endMonth: null }, { endMonth: { $gte: thisMonth } }] }).lean(),
    Expense.find({ workspaceId, month: { $in: months }, status: 'active', commitmentId: { $ne: null } }).select('commitmentId month').lean(),
  ]);
  const rows: ReminderCommitment[] = commitments.map((c) => ({
    id: String(c._id), title: c.title, type: c.type, ownerId: c.ownerId ? String(c.ownerId) : null,
    category: c.category, customCategory: c.customCategory, dueDay: c.dueDay ?? 1, reminderDaysBefore: c.reminderDaysBefore,
    amountHistory: c.amountHistory, startMonth: c.startMonth, endMonth: c.endMonth, archived: c.archived,
  }));
  const paid = new Set(payments.map((p) => `${String(p.commitmentId)}:${p.month}`));
  return { memberIds: (ws?.members ?? []).map((m) => String(m.userId)), rows, paid };
}

/** Reminders for a member: their personal commitments plus common ones. */
export async function listReminders(workspaceId: string, userId: string, today = todayStr()) {
  const d = await loadData(workspaceId, today);
  return computeReminders(d.rows, d.paid, today, userId, d.memberIds);
}

const fmt = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Emails each active member a list of bills that are due soon or overdue.
 * Meant to run once a day (Vercel Cron → POST /api/cron/reminders).
 */
export async function sendReminderEmails(today = todayStr()) {
  const users = await User.find({ status: 'active', email: { $ne: null } }).lean();
  const byWs = new Map<string, typeof users>();
  for (const u of users) byWs.set(String(u.workspaceId), [...(byWs.get(String(u.workspaceId)) ?? []), u]);
  let sent = 0;
  for (const [workspaceId, members] of byWs) {
    const d = await loadData(workspaceId, today);
    for (const u of members) {
      const items = computeReminders(d.rows, d.paid, today, String(u._id), d.memberIds);
      if (!items.length || !u.email) continue;
      const line = (r: (typeof items)[number]) =>
        `${r.title} — AED ${fmt(r.myShare)}${r.type === 'common' ? ` (your share of ${fmt(r.amount)})` : ''} — ${
          r.status === 'overdue' ? `overdue since ${r.dueDate}` : r.status === 'due-today' ? 'due today' : `due ${r.dueDate}`}`;
      const res = await sendMail({
        to: u.email,
        subject: `${items.length} bill${items.length === 1 ? '' : 's'} due soon`,
        text: `Hi ${u.displayName},\n\n${items.map((r) => `• ${line(r)}`).join('\n')}\n\nMark them paid: ${env.appUrl}/commitments`,
        html: `<p>Hi ${escapeHtml(u.displayName)},</p><ul>${items.map((r) => `<li>${escapeHtml(line(r))}</li>`).join('')}</ul><p><a href="${env.appUrl}/commitments">Open commitments</a></p>`,
      });
      if (res.sent) sent += 1;
    }
  }
  return { sent };
}
