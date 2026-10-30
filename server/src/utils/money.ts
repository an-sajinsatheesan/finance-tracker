/** Round to 2 decimals (fils) avoiding float drift. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

/** Split an amount equally across n people; any leftover fils go to the first person. */
export function splitEqually(amount: number, n: number): number[] {
  const totalFils = Math.round(amount * 100);
  const base = Math.floor(totalFils / n);
  const rem = totalFils - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}
