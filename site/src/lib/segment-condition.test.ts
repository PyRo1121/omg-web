import { describe, expect, it } from 'vitest';
import { betweenRange, numericInputValue, scalarConditionValue } from './segment-condition';

describe('scalarConditionValue', () => {
  it('returns a stored string or number', () => {
    expect(scalarConditionValue('pro')).toBe('pro');
    expect(scalarConditionValue(12)).toBe(12);
  });

  it('returns the lower bound of a range', () => {
    expect(scalarConditionValue([3, 9])).toBe(3);
  });
});

describe('betweenRange', () => {
  it('returns both bounds of a range', () => {
    expect(betweenRange([3, 9])).toEqual([3, 9]);
  });

  it('treats a scalar as a collapsed range', () => {
    expect(betweenRange(4)).toEqual([4, 4]);
    expect(betweenRange('8')).toEqual([8, 8]);
  });
});

describe('numericInputValue', () => {
  it('parses numeric strings and numbers', () => {
    expect(numericInputValue('12.5')).toBe(12.5);
    expect(numericInputValue(4)).toBe(4);
  });

  it('returns 0 for non-numeric input', () => {
    expect(numericInputValue('nope')).toBe(0);
  });
});
