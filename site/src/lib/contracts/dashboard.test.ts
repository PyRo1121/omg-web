import { describe, expect, it } from 'vitest';
import { decodeDashboardData } from './dashboard';

const validPayload = {
  user: {
    id: 'u1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  sessions: [
    {
      id: 's1',
      ipAddress: null,
      userAgent: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-02-01T00:00:00.000Z',
      isCurrent: true,
    },
  ],
  accounts: [{ provider: 'github', accountId: 'gh-1' }],
};

describe('decodeDashboardData', () => {
  it('decodes a valid account dashboard payload', () => {
    const decoded = decodeDashboardData(validPayload);
    expect(decoded).not.toBeNull();
    expect(decoded?.user.email).toBe('ada@example.com');
    expect(decoded?.sessions[0].isCurrent).toBe(true);
    expect(decoded?.accounts[0].provider).toBe('github');
  });

  it('rejects a payload where emailVerified is not a boolean', () => {
    const malformed = {
      ...validPayload,
      user: { ...validPayload.user, emailVerified: 'yes' },
    };
    expect(decodeDashboardData(malformed)).toBeNull();
  });

  it('rejects a payload with a non-array sessions block', () => {
    const malformed = { ...validPayload, sessions: 'none' };
    expect(decodeDashboardData(malformed)).toBeNull();
  });

  it('rejects a non-object payload', () => {
    expect(decodeDashboardData(undefined)).toBeNull();
    expect(decodeDashboardData([])).toBeNull();
  });
});
