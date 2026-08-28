import { describe, expect, it } from 'vitest';
import type { AuthEnvironment } from './auth.server';
import { loadAccountDashboardContext } from './account-dashboard.server';

const PAGE_URL = new URL('https://shadow.example/dashboard/');

interface ExecutedQuery {
  readonly sql: string;
  readonly bindings: ReadonlyArray<unknown>;
}

function createD1Stub(rowsByTable: {
  readonly auth_account: ReadonlyArray<object>;
  readonly auth_session: ReadonlyArray<object>;
}) {
  const queries: Array<ExecutedQuery> = [];
  const db: AuthEnvironment['DB'] = {
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
    prepare: (sql: string) => ({
      all: async () => ({ results: [] }),
      bind: (...bindings: Array<unknown>) => ({
        all: async () => {
          queries.push({ bindings, sql });
          const table = sql.includes('auth_session') ? 'auth_session' : 'auth_account';
          return { results: rowsByTable[table] };
        },
        bind: () => {
          throw new Error('bind may only be called once');
        },
        first: async () => null,
        raw: async () => [],
        run: async () => ({ success: true }),
      }),
      first: async () => null,
      raw: async () => [],
      run: async () => ({ success: true }),
    }),
    withSession: () => db,
  };
  return { db, queries };
}

function dashboardRequest(db: AuthEnvironment['DB']) {
  return {
    platform: {
      env: {
        BETTER_AUTH_SECRET: 'test-auth-secret',
        DB: db,
        GITHUB_CLIENT_ID: 'test-github-client',
        GITHUB_CLIENT_SECRET: 'test-github-secret',
        LICENSING_API: { fetch: async () => Response.json({}) },
        SVELTE_BFF_SECRET: 'test-svelte-bff-secret',
      },
    },
    request: new Request(PAGE_URL),
    url: PAGE_URL,
  };
}

const providerSession = {
  session: {
    expiresAt: new Date('2027-02-01T00:00:00.000Z'),
    token: 'current-token',
  },
  user: {
    createdAt: '2026-01-01T00:00:00.000Z',
    email: 'ada@example.com',
    emailVerified: true,
    id: 'user-1',
    image: null,
    name: 'Ada',
  },
};

describe('loadAccountDashboardContext', () => {
  it('uses one auth lookup and parameterized least-privilege D1 reads', async () => {
    const { db, queries } = createD1Stub({
      auth_session: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-02-01T00:00:00.000Z',
          id: 'session-current',
          ipAddress: '   ',
          token: 'current-token',
          userAgent: 'Test Browser',
        },
        {
          createdAt: 1_767_225_600_000,
          expiresAt: 1_769_904_000_000,
          id: 'session-legacy',
          ipAddress: '127.0.0.1',
          token: 'legacy-token',
          userAgent: null,
        },
      ],
      auth_account: [{ accountId: 'github-ada', providerId: 'github' }],
    });
    let lookups = 0;

    const result = await loadAccountDashboardContext(dashboardRequest(db), async () => {
      lookups += 1;
      return providerSession;
    });

    expect(lookups).toBe(1);
    expect(queries).toHaveLength(2);
    expect(queries.map(query => query.bindings)).toEqual([['user-1'], ['user-1']]);
    expect(queries.map(query => query.sql)).toEqual([
      'SELECT id, token, ip_address AS ipAddress, user_agent AS userAgent, created_at AS createdAt, expires_at AS expiresAt FROM auth_session WHERE user_id = ?',
      'SELECT provider_id AS providerId, account_id AS accountId FROM auth_account WHERE user_id = ?',
    ]);
    expect(result?.dashboard).toEqual({
      accounts: [{ provider: 'github' }],
      sessions: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-02-01T00:00:00.000Z',
          ipAddress: null,
          isCurrent: true,
          userAgent: 'Test Browser',
        },
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-02-01T00:00:00.000Z',
          ipAddress: '127.0.0.1',
          isCurrent: false,
          userAgent: null,
        },
      ],
      user: {
        createdAt: '2026-01-01T00:00:00.000Z',
        email: 'ada@example.com',
        emailVerified: true,
        name: 'Ada',
      },
    });
    expect(JSON.stringify(result?.dashboard)).not.toContain('current-token');
    expect(JSON.stringify(result?.dashboard)).not.toContain('user-1');
    expect(JSON.stringify(result?.dashboard)).not.toContain('session-current');
    expect(JSON.stringify(result?.dashboard)).not.toContain('github-ada');
  });

  it('fails with 503 before auth lookup when the platform is missing', async () => {
    let lookupCalled = false;
    const result = loadAccountDashboardContext(
      { platform: undefined, request: new Request(PAGE_URL), url: PAGE_URL },
      async () => {
        lookupCalled = true;
        return null;
      }
    );

    await expect(result).rejects.toMatchObject({ status: 503 });
    expect(lookupCalled).toBe(false);
  });

  it('returns null without querying D1 for an anonymous request', async () => {
    const { db, queries } = createD1Stub({ auth_account: [], auth_session: [] });

    const result = await loadAccountDashboardContext(dashboardRequest(db), async () => null);

    expect(result).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('rejects malformed persisted rows parsed at the D1 boundary', async () => {
    const { db } = createD1Stub({
      auth_account: [],
      auth_session: [
        {
          createdAt: 'not-a-timestamp',
          expiresAt: 1_769_904_000_000,
          id: 'session-1',
          ipAddress: null,
          token: 'current-token',
          userAgent: null,
        },
      ],
    });

    await expect(
      loadAccountDashboardContext(dashboardRequest(db), async () => providerSession)
    ).rejects.toMatchObject({ status: 500 });
  });
});
