import { describe, expect, it } from 'vitest';
import { formatExpiry, verificationLabel } from './dashboard-view';

describe('verificationLabel', () => {
  it('labels a verified email', () => {
    expect(verificationLabel(true)).toBe('verified');
  });

  it('labels an unverified email', () => {
    expect(verificationLabel(false)).toBe('unverified');
  });
});

describe('formatExpiry', () => {
  it('formats an ISO timestamp in UTC', () => {
    expect(formatExpiry('2026-02-14T09:30:00.000Z')).toBe('Feb 14, 2026, 9:30 AM UTC');
  });

  it('returns the raw value when it is not a valid date', () => {
    expect(formatExpiry('not-a-date')).toBe('not-a-date');
  });
});
