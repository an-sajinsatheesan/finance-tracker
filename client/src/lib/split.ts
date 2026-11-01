import type { Member, Share, SplitMode } from './types';

/**
 * Splits an amount by weights in fils so the parts always add up (same rule as the
 * server): leftover fils go to the largest remainders, ties to the first person.
 */
export function splitByWeights(amount: number, weights: number[]): number[] {
  const totalFils = Math.round(amount * 100);
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (totalFils * w) / total);
  const fils = exact.map(Math.floor);
  const rem = totalFils - fils.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < rem; k++) fils[order[k % order.length].i]++;
  return fils.map((f) => f / 100);
}

/** A member's recurring monthly income (used to preview "split by salary"). */
export const salaryOf = (m: Member) => m.incomeSources.filter((s) => s.active !== false).reduce((a, s) => a + s.amount, 0);

/** Each member's part of `amount` for a split (equal when nothing usable is set). */
export function previewSplit(amount: number, members: Member[], mode: SplitMode, custom: Share[] = []): number[] {
  const w = mode === 'custom' ? members.map((m) => custom.find((s) => s.userId === m.userId)?.amount ?? 0)
    : mode === 'income' ? members.map(salaryOf) : [];
  return splitByWeights(amount, w.some((x) => x > 0) ? w : members.map(() => 1));
}

export const SPLIT_LABEL: Record<SplitMode, string> = { equal: '50/50', custom: 'Custom', income: 'By salary' };
