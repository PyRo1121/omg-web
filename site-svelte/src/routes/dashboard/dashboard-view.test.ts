import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDuration,
  formatProductLabel,
  formatTimestamp,
  machineAllowanceLabel,
  streakLabel,
  providerLabel,
  verificationLabel,
} from './dashboard-view';

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

describe('licensing labels', () => {
  it.each([
    ['team', 'Team'],
    ['past_due', 'Past Due'],
    ['cancel-at-period-end', 'Cancel At Period End'],
  ])('formats %s as %s', (value, label) => {
    expect(formatProductLabel(value)).toBe(label);
  });

  it('formats active machines against the allowance', () => {
    expect(machineAllowanceLabel(2, 5)).toBe('2 of 5');
  });
});

describe('usage labels', () => {
  it('formats counts without invented precision', () => {
    expect(formatCount(12_345)).toBe('12,345');
  });

  it.each([
    [0, '0 min'],
    [30_000, '<1 min'],
    [3_660_000, '1h 1m'],
    [7_200_000, '2h'],
  ])('formats %s milliseconds as %s', (milliseconds, label) => {
    expect(formatDuration(milliseconds)).toBe(label);
  });

  it.each([
    [0, '0 days'],
    [1, '1 day'],
    [7, '7 days'],
  ])('formats a %s-day streak as %s', (days, label) => {
    expect(streakLabel(days)).toBe(label);
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
