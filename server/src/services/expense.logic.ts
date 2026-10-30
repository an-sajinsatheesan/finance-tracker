import { splitEqually } from '../utils/money.js';

/**
 * Builds the cost shares for an expense.
 * - Personal: the whole amount belongs to the owner.
 * - Common: split equally between all workspace members.
 * The shares always sum to the amount, so the expense is counted exactly once.
 */
export function buildShares(
  type: 'personal' | 'common',
  amount: number,
  memberIds: string[],
  ownerId?: string | null,
): { userId: string; amount: number }[] {
  if (type === 'personal') {
    if (!ownerId) throw new Error('Personal expense needs an owner');
    return [{ userId: ownerId, amount }];
  }
  const parts = splitEqually(amount, memberIds.length);
  return memberIds.map((userId, i) => ({ userId, amount: parts[i] }));
}
