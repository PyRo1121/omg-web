import { describe, expect, it } from 'vitest';
import { formatTimestamp, providerLabel, verificationLabel } from './dashboard-view';

describe('verificationLabel', () => {
  it('labels a verified email', () => {
    expect(verificationLabel(true)).toBe('verified');
  });

  it('labels an unverified email', () => {
    expect(verificationLabel(false)).toBe('unverified');
  });
});

describe('providerLabel', () => {
  it.each([
    ['github', 'GitHub'],
    ['credential', 'Password'],
    ['custom', 'custom'],
  ])('labels %s as %s', (provider, label) => {
    expect(providerLabel(provider)).toBe(label);
  });
});

describe('formatTimestamp', () => {
  it('formats an ISO timestamp in UTC', () => {
    expect(formatTimestamp('2026-02-14T09:30:00.000Z')).toBe('Feb 14, 2026, 9:30 AM UTC');
  });

  it.each([null, 'not-a-date'])('marks %s as unavailable', value => {
    expect(formatTimestamp(value)).toBe('Unavailable');
  });
});
