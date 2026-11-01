import { splitEqually } from '../utils/money.js';
import { splitByWeights } from './commitment.logic.js';

/**
 * Builds the cost shares for an expense.
 * - Personal: the whole amount belongs to one person — the owner, or the partner
 *   who paid it as support (`bearer`).
 * - Common: split equally between all workspace members, or by `weights` (one per
 *   member) when the commitment it pays has another split.
 * The shares always sum to the amount, so the expense is counted exactly once.
 */
export function buildShares(
  type: 'personal' | 'common',
  amount: number,
  memberIds: string[],
  ownerId?: string | null,
  opts: { weights?: number[]; bearer?: string | null } = {},
): { userId: string; amount: number }[] {
  if (type === 'personal') {
    if (!ownerId) throw new Error('Personal expense needs an owner');
    return [{ userId: opts.bearer || ownerId, amount }];
  }
  const parts = opts.weights ? splitByWeights(amount, opts.weights) : splitEqually(amount, memberIds.length);
  return memberIds.map((userId, i) => ({ userId, amount: parts[i] }));
}
