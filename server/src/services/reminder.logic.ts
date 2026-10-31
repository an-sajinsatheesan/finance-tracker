/** Bill-payment reminders for commitments (pure, no DB). */
import { categoryLabel } from '../utils/categories.js';
import { addMonths, dateInMonth } from '../utils/month.js';
import { amountFor, isActiveIn } from './commitment.logic.js';
import { plannedFor, type CommitmentRow, type Scope } from './summary.logic.js';

export interface ReminderCommitment extends CommitmentRow { reminderDaysBefore?: number | null }

export interface Reminder {
  id: string; title: string; type: 'personal' | 'common'; ownerId?: string | null; category: string;
  month: string; dueDate: string; daysUntil: number; amount: number; myShare: number;
  status: 'overdue' | 'due-today' | 'due-soon';
}

const dayNumber = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;

/**
 * Unpaid commitments that are overdue this month, or due within their
 * reminder window (which may reach into next month).
 * `paid` holds "<commitmentId>:<month>" keys for recorded payments.
 */
export function computeReminders(
  commitments: ReminderCommitment[],
  paid: Set<string>,
  today: string,
  scope: Scope,
  memberIds: string[],
): Reminder[] {
  const thisMonth = today.slice(0, 7);
  const out: Reminder[] = [];
  for (const month of [thisMonth, addMonths(thisMonth, 1)]) {
    for (const c of commitments) {
      if (c.reminderDaysBefore === null) continue; // reminders switched off
      const window = c.reminderDaysBefore ?? 3; // missing on commitments created before reminders existed
      if (!isActiveIn(c, month) || paid.has(`${c.id}:${month}`)) continue;
      const mine = plannedFor(c, month, scope, memberIds);
      if (scope !== 'common' && mine <= 0) continue;
      const dueDate = dateInMonth(month, c.dueDay ?? 1);
      const daysUntil = dayNumber(dueDate) - dayNumber(today);
      if (daysUntil < 0 && month !== thisMonth) continue;
      if (daysUntil > window) continue;
      out.push({
        id: c.id, title: c.title, type: c.type, ownerId: c.ownerId ?? null, category: categoryLabel(c.category, c.customCategory),
        month, dueDate, daysUntil, amount: amountFor(c, month), myShare: mine,
        status: daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'due-today' : 'due-soon',
      });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}
