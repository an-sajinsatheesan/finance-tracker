import { describe, expect, it } from 'vitest';
import { paymentStatus } from './commitment.logic.js';

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
});
