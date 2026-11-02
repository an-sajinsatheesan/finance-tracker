import { describe, expect, it } from 'vitest';
import { paymentStatus, splitByWeights, splitWeights } from './commitment.logic.js';

describe('commitment payment status', () => {
  it('is unpaid with no payments', () => {
    expect(paymentStatus(400, [])).toMatchObject({ paid: false, paidAmount: 0, remaining: 400, contributions: [] });
  });

  it('adds up part payments by each partner until the planned amount is reached', () => {
    const half = paymentStatus(400, [{ amount: 200, paidBy: 's', settlesCommitment: false }]);
    expect(half).toMatchObject({ paid: false, paidAmount: 200, remaining: 200 });
    const both = paymentStatus(400, [{ amount: 200, paidBy: 's', settlesCommitment: false }, { amount: 200, paidBy: 'a', settlesCommitment: true }]);
    expect(both).toMatchObject({ paid: true, remaining: 0, contributions: [{ userId: 's', amount: 200 }, { userId: 'a', amount: 200 }] });
  });

  it('is paid by a smaller final payment, and by older payments that had no flag', () => {
    expect(paymentStatus(400, [{ amount: 300, paidBy: 's', settlesCommitment: true }])).toMatchObject({ paid: true, remaining: 100 });
    expect(paymentStatus(400, [{ amount: 300, paidBy: 's' }])).toMatchObject({ paid: true });
  });

  it('credits each partner their share when the bill is paid from the common account', () => {
    const p = paymentStatus(320, [{ amount: 320, paidBy: 'a', fromCommon: true, shares: [{ userId: 's', amount: 160 }, { userId: 'a', amount: 160 }] }]);
    expect(p).toMatchObject({ paid: true, contributions: [{ userId: 's', amount: 160 }, { userId: 'a', amount: 160 }] });
  });
});

describe('common commitment split', () => {
  const ids = ['h', 'w'];
  it('is 50/50 by default and for older commitments without a split', () => {
    expect(splitByWeights(350, splitWeights(undefined, ids))).toEqual([175, 175]);
    expect(splitByWeights(203.55, splitWeights({ mode: 'equal' }, ids))).toEqual([101.78, 101.77]);
  });
  it('follows custom amounts, scaling when the bill changes', () => {
    const w = splitWeights({ mode: 'custom', shares: [{ userId: 'h', amount: 150 }, { userId: 'w', amount: 200 }] }, ids);
    expect(splitByWeights(350, w)).toEqual([150, 200]);
    expect(splitByWeights(700, w)).toEqual([300, 400]);
  });
  it('follows income, falling back to equal without any', () => {
    expect(splitByWeights(300, splitWeights({ mode: 'income' }, ids, { h: 13000, w: 7000 }))).toEqual([195, 105]);
    expect(splitByWeights(300, splitWeights({ mode: 'income' }, ids, {}))).toEqual([150, 150]);
  });
});
