import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AccountDashboardSessionRowSchema,
  decodeDashboardData,
  parseAccountDashboard,
} from './account-dashboard';
import { readD1RowArray } from './d1-rows';

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
    expect(decoded?.sessions.at(0)?.isCurrent).toBe(true);
    expect(decoded?.accounts.at(0)?.provider).toBe('github');
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

describe('AccountDashboardSessionRowSchema', () => {
  it('decodes current ISO and legacy integer timestamps', async () => {
    const result = await readD1RowArray(
      AccountDashboardSessionRowSchema,
      'Session rows have an invalid shape',
      [
        {
          id: 'current',
          token: 'current-token',
          ipAddress: null,
          userAgent: 'Browser',
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-02-01T00:00:00.000Z',
        },
        {
          id: 'legacy',
          token: 'legacy-token',
          ipAddress: null,
          userAgent: null,
          createdAt: 1_767_225_600_000,
          expiresAt: 1_769_904_000_000,
        },
      ]
    );

    expect(result._tag).toBe('ok');
    if (result._tag === 'ok') {
      expect(result.value.map(row => row.createdAt.toISOString())).toEqual([
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ]);
    }
  });
});

describe('parseAccountDashboard', () => {
  it('succeeds for a valid payload and ignores extra fields', async () => {
    const exit = await Effect.runPromiseExit(
      parseAccountDashboard({ ...validPayload, extra: true })
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.user.email).toBe('ada@example.com');
    }
  });

  it('fails when emailVerified is not a boolean', async () => {
    const malformed = {
      ...validPayload,
      user: { ...validPayload.user, emailVerified: 'yes' },
    };
    const exit = await Effect.runPromiseExit(parseAccountDashboard(malformed));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
