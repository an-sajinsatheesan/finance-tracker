/** Pure commitment rules (no DB) — shared by services, summary and tests. */
export interface CommitmentLike {
  amountHistory: { fromMonth: string; amount: number }[];
  startMonth: string;
  endMonth?: string | null;
  archived?: boolean;
}

export type CommitmentStatus = 'active' | 'scheduled' | 'ended';

/**
 * `fromCommon`: paid from the couple's common account, so each partner paid their own
 * share of it (`shares`) rather than the person who recorded it.
 */
export interface PaymentLike {
  amount: number; paidBy: string; settlesCommitment?: boolean | null;
  fromCommon?: boolean; shares?: { userId: string; amount: number }[];
}

/**
 * What has been paid towards a commitment in a month. Several payments can add up
 * (each partner paying part of a common bill); it is paid once they reach the planned
 * amount or one of them was marked as the final payment (e.g. a smaller bill).
 */
export function paymentStatus(planned: number, payments: PaymentLike[]) {
  const paidAmount = Math.round(payments.reduce((a, p) => a + p.amount, 0) * 100) / 100;
  const byPerson = new Map<string, number>();
  const add = (userId: string, v: number) => byPerson.set(userId, Math.round(((byPerson.get(userId) ?? 0) + v) * 100) / 100);
  for (const p of payments) {
    if (p.fromCommon && p.shares?.length) for (const s of p.shares) add(s.userId, s.amount);
    else add(p.paidBy, p.amount);
  }
  return {
    paidAmount,
    remaining: Math.max(0, Math.round((planned - paidAmount) * 100) / 100),
    paid: payments.length > 0 && (paidAmount >= planned - 0.005 || payments.some((p) => p.settlesCommitment !== false)),
    contributions: [...byPerson].map(([userId, amount]) => ({ userId, amount })),
  };
}

/** Planned amount for a given month (latest version whose fromMonth <= month). */
export function amountFor(c: CommitmentLike, month: string): number {
  const versions = [...c.amountHistory].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  let amount = versions[0]?.amount ?? 0;
  for (const v of versions) if (v.fromMonth <= month) amount = v.amount;
  return amount;
}

/** A commitment applies to a month between its start and (inclusive) end month. */
export function isActiveIn(c: CommitmentLike, month: string): boolean {
  if (c.archived) return false;
  if (month < c.startMonth) return false;
  if (c.endMonth && month > c.endMonth) return false;
  return true;
}

/** Tab status relative to a reference month (normally the current month). */
export function statusAt(c: CommitmentLike, refMonth: string): CommitmentStatus {
  if (c.archived) return 'ended';
  if (c.endMonth && c.endMonth < refMonth) return 'ended';
  if (c.startMonth > refMonth) return 'scheduled';
  return 'active';
}

export type SplitMode = 'equal' | 'custom' | 'income';
export interface SplitLike { mode?: SplitMode | null; shares?: { userId: string; amount: number }[] | null }

/**
 * How a common commitment is shared, as one weight per member (in memberIds order).
 * - equal: 50/50 (also the fallback when nothing usable is set).
 * - custom: the planned amounts each person agreed to pay (e.g. 150 / 200 of 350);
 *   if the total amount changes later they scale proportionally.
 * - income: in proportion to each person's expected income that month.
 */
export function splitWeights(split: SplitLike | null | undefined, memberIds: string[], income: Record<string, number> = {}): number[] {
  const weight = split?.mode === 'custom'
    ? (id: string) => split.shares?.find((s) => String(s.userId) === id)?.amount ?? 0
    : split?.mode === 'income' ? (id: string) => income[id] ?? 0 : null;
  const w = weight ? memberIds.map((id) => Math.max(0, weight(id))) : [];
  return w.some((x) => x > 0) ? w : memberIds.map(() => 1);
}

/**
 * Splits an amount by weights in fils so the parts always add up. Leftover fils go to
 * the largest remainders (ties: the first person, as with an equal split).
 */
export function splitByWeights(amount: number, weights: number[]): number[] {
  const totalFils = Math.round(amount * 100);
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (totalFils * w) / total);
  const fils = exact.map(Math.floor);
  const rem = totalFils - fils.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < rem; k++) fils[order[k % order.length].i]++;
  return fils.map((f) => f / 100);
}
