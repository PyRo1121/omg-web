import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import type { LicensingSummaryEnvironment } from './licensing-service.server';
import {
  loadAccountAchievements,
  loadAccountAchievementsState,
} from './account-achievements.server';

const identity = {
  id: 'user-id',
  email: 'ada@example.com',
  name: 'Ada',
  emailVerified: true,
};

interface AchievementPayload {
  readonly license?: { readonly license_key: string };
  readonly achievements: ReadonlyArray<{
    readonly id: string;
    readonly emoji: string;
    readonly name: string;
    readonly description: string;
    readonly unlocked: boolean;
    readonly unlocked_at: string | null;
  }>;
}

class AchievementServiceStub {
  readonly requests: Array<Request> = [];
  constructor(private readonly payload: AchievementPayload) {}

  async fetch(request: Request): Promise<Response> {
    this.requests.push(request.clone());
    return request.url.endsWith('/api/internal/site-session')
      ? Response.json({
          token: 'private-token',
          expiresAt: '2026-08-28T14:00:00Z',
          customerId: 'customer-id',
        })
      : Response.json(this.payload);
  }
}

function environment(service: AchievementServiceStub): LicensingSummaryEnvironment {
  return {
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ role: 'user' }) }) }) },
    SVELTE_BFF_SECRET: 'private-secret',
    LICENSING_API: service,
  };
}

describe('account achievements service', () => {
  it('projects grounded achievement fields without account identifiers', async () => {
    const service = new AchievementServiceStub({
      license: { license_key: 'raw-key' },
      achievements: [
        {
          id: 'first-command',
          emoji: 'rocket',
          name: 'First command',
          description: 'Run your first command.',
          unlocked: true,
          unlocked_at: '2026-08-27T12:00:00.000Z',
        },
        {
          id: 'package-pro',
          emoji: 'package',
          name: 'Package pro',
          description: 'Install ten packages.',
          unlocked: false,
          unlocked_at: null,
        },
      ],
    });

    const result = await Effect.runPromise(loadAccountAchievements(identity, environment(service)));

    expect(result).toEqual({
      unlocked: 1,
      total: 2,
      achievements: [
        {
          name: 'First command',
          description: 'Run your first command.',
          unlocked: true,
          unlockedAt: '2026-08-27T12:00:00.000Z',
        },
        {
          name: 'Package pro',
          description: 'Install ten packages.',
          unlocked: false,
          unlockedAt: null,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('raw-key');
    expect(JSON.stringify(result)).not.toContain('first-command');
    expect(service.requests[1]?.headers.get('Authorization')).toBe('Bearer private-token');
  });

  it('requires a verified email before private service access', async () => {
    const service = new AchievementServiceStub({ achievements: [] });

    const state = await loadAccountAchievementsState(
      { ...identity, emailVerified: false },
      environment(service)
    );

    expect(state).toEqual({ status: 'verification-required' });
    expect(service.requests).toHaveLength(0);
  });

  it('rejects inconsistent locked achievement timestamps', async () => {
    const service = new AchievementServiceStub({
      achievements: [
        {
          id: 'bad',
          emoji: 'x',
          name: 'Bad',
          description: 'Bad row',
          unlocked: false,
          unlocked_at: '2026-08-27T12:00:00.000Z',
        },
      ],
    });

    const exit = await Effect.runPromiseExit(
      loadAccountAchievements(identity, environment(service))
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});
