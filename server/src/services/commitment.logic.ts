/** Pure commitment rules (no DB) — shared by services, summary and tests. */
export interface CommitmentLike {
  amountHistory: { fromMonth: string; amount: number }[];
  startMonth: string;
  endMonth?: string | null;
  archived?: boolean;
}

export type CommitmentStatus = 'active' | 'scheduled' | 'ended';

export interface PaymentLike { amount: number; paidBy: string; settlesCommitment?: boolean | null }

/**
 * What has been paid towards a commitment in a month. Several payments can add up
 * (each partner paying part of a common bill); it is paid once they reach the planned
 * amount or one of them was marked as the final payment (e.g. a smaller bill).
 */
export function paymentStatus(planned: number, payments: PaymentLike[]) {
  const paidAmount = Math.round(payments.reduce((a, p) => a + p.amount, 0) * 100) / 100;
  const byPerson = new Map<string, number>();
  for (const p of payments) byPerson.set(p.paidBy, Math.round(((byPerson.get(p.paidBy) ?? 0) + p.amount) * 100) / 100);
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
