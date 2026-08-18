import { describe, expect, it } from 'vitest';
import { nestedNumber } from './nested-metric';

describe('nestedNumber', () => {
  it('reads a nested numeric field', () => {
    expect(nestedNumber({ engagement: { dau: 12 } }, 'engagement.dau')).toBe(12);
  });

  it('returns 0 for a missing path', () => {
    expect(nestedNumber({ engagement: {} }, 'engagement.dau')).toBe(0);
  });
});
