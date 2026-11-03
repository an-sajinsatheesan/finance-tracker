import { describe, expect, it } from 'vitest';
import { pricePerGram } from './gold.service.js';

describe('gold price per gram', () => {
  it('uses the price given for that purity', () => {
    expect(pricePerGram({ perGram24: 8000, perGram22: 7400 }, '22K')).toBe(7400);
  });
  it('works out 22K and 18K from the 24K price when they are missing', () => {
    expect(pricePerGram({ perGram24: 8400 }, '22K')).toBe(7700);
    expect(pricePerGram({ perGram24: 8400 }, '18K')).toBe(6300);
  });
  it('has no value without a price', () => {
    expect(pricePerGram(null, '22K')).toBeNull();
    expect(pricePerGram({}, '24K')).toBeNull();
  });
});
