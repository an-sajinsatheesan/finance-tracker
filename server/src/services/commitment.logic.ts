/** Pure commitment rules (no DB) — shared by services, summary and tests. */
export interface CommitmentLike {
  amountHistory: { fromMonth: string; amount: number }[];
  startMonth: string;
  endMonth?: string | null;
  archived?: boolean;
}

export type CommitmentStatus = 'active' | 'scheduled' | 'ended';

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
