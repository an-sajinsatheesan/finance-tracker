import { describe, expect, it } from 'vitest';
import { chequeSchedule, contractEnd, monthlyAmount } from './contract.logic.js';

describe('rent contract cheques', () => {
  it('spreads 6 cheques over 12 months, one every 2 months', () => {
    const s = chequeSchedule('2026-09-28', 12, 36000, 6);
    expect(s.map((c) => c.date)).toEqual(['2026-09-28', '2026-11-28', '2027-01-28', '2027-03-28', '2027-05-28', '2027-07-28']);
    expect(s.every((c) => c.amount === 6000)).toBe(true);
  });

  it('keeps the total when it does not split evenly, and the day in short months', () => {
    const s = chequeSchedule('2026-01-31', 12, 10000, 3);
    expect(s.map((c) => c.date)).toEqual(['2026-01-31', '2026-05-31', '2026-09-30']);
    expect(s.reduce((a, c) => a + c.amount, 0)).toBeCloseTo(10000, 2);
  });

  it('ends the day before the next period and budgets the monthly amount', () => {
    expect(contractEnd('2026-09-28', 12)).toBe('2027-09-27');
    expect(monthlyAmount(36000, 12)).toBe(3000);
  });
});
