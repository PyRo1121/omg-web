import { describe, expect, it } from 'vitest';
import { valueForKey } from './lookup';

const ICONS = {
  general: 'file',
  call: 'phone',
} as const;

describe('valueForKey', () => {
  it('returns the value for a known key', () => {
    expect(valueForKey(Object.entries(ICONS), 'call')).toBe('phone');
  });

  it('returns undefined for an unknown key', () => {
    expect(valueForKey(Object.entries(ICONS), 'sales')).toBeUndefined();
  });
});
