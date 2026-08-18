import { describe, expect, it } from 'vitest';
import { parseTier } from './tier';

describe('parseTier', () => {
  it('normalizes a valid tier', () => {
    expect(parseTier('Pro')).toBe('pro');
  });

  it('defaults unknown values to free', () => {
    expect(parseTier('gold')).toBe('free');
  });
});
