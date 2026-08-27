import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  LicensingSummaryBodyTooLarge,
  LicensingSummaryInvalidInput,
  LicensingSummaryInvalidPayload,
  LicensingSummaryServiceUnavailable,
  loadLicensingSummary,
  loadLicensingSummaryState,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
} from './licensing-summary.server';

const VALID_ROLES: ReadonlyArray<'user' | 'admin'> = ['user', 'admin'];

const identity = {
  id: 'better-auth-user-1',
  email: 'ada@example.com',
  name: 'Ada',
  emailVerified: true,
};

interface RecordedRequest {
  readonly authorization: string | null;
  readonly cookie: string | null;
  readonly internalCall: string | null;
  readonly method: string;
  readonly secret: string | null;
  readonly url: string;
}

class LicensingServiceStub {
  readonly requests: Array<RecordedRequest> = [];

  constructor(
    private readonly sessionResponse: () => Response,
    private readonly dashboardResponse: () => Response
  ) {}

  async fetch(request: Request): Promise<Response> {
    this.requests.push({
      authorization: request.headers.get('Authorization'),
      cookie: request.headers.get('Cookie'),
      internalCall: request.headers.get('X-Internal-Call'),
      method: request.method,
      secret: request.headers.get('X-Admin-Secret'),
      url: request.url,
    });
    return new URL(request.url).pathname === '/api/internal/site-session'
      ? this.sessionResponse()
      : this.dashboardResponse();
  }
}

function dashboardPayload() {
  return {
    user: { id: 'customer-1', email: identity.email, name: identity.name },
    license: {
      id: 'license-1',
      license_key: 'never-return-this-key',
      tier: 'team',
      status: 'active',
      max_machines: 3,
      expires_at: '2027-01-01T00:00:00.000Z',
    },
    machines: [{ id: 'machine-1', machine_id: 'private-machine-1', is_active: 1 }],
    usage: {
      total_commands: 12_345,
      total_packages_installed: 321,
      total_runtimes_switched: 45,
      total_time_saved_ms: 3_660_000,
      current_streak: 7,
    },
    global_stats: {
      top_package: 'ripgrep',
      top_runtime: 'node',
    },
    subscription: {
      status: 'trialing',
      current_period_end: '2026-10-01T00:00:00.000Z',
      cancel_at_period_end: 1,
    },
    is_admin: true,
  };
}

type RoleFixture = 'user' | 'admin' | 'owner';

function environment(
  role: RoleFixture,
  service: LicensingServiceStub,
  onDatabaseCall: () => void = () => undefined
): LicensingSummaryEnvironment {
  return {
    DB: {
      prepare: sql => ({
        bind: (...bindings) => ({
          first: async () => {
            onDatabaseCall();
            expect(sql).toBe('SELECT role FROM auth_user WHERE id = ?');
            expect(bindings).toEqual([identity.id]);
            return { role };
          },
        }),
      }),
    },
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

function serviceWith(
  session: () => Response = () =>
    Response.json({
      token: 'server-only-token',
      expiresAt: '2026-09-01T00:00:00.000Z',
      customerId: 'customer-1',
    }),
  dashboard: () => Response = () => Response.json(dashboardPayload())
): LicensingServiceStub {
  return new LicensingServiceStub(session, dashboard);
}

function failureOf(exit: Exit.Exit<unknown, LicensingSummaryError>): LicensingSummaryError | null {
  return Exit.isSuccess(exit) ? null : Option.getOrNull(Cause.findErrorOption(exit.cause));
}

describe('loadLicensingSummary', () => {
  it('maps the role, sends only private service credentials, and projects a safe summary', async () => {
    const service = serviceWith();

    const summary = await Effect.runPromise(
      loadLicensingSummary(identity, environment('admin', service))
    );

    expect(service.requests).toEqual([
      {
        authorization: null,
        cookie: null,
        internalCall: 'service-binding',
        method: 'POST',
        secret: 'private-bff-secret',
        url: 'https://omg-saas.internal/api/internal/site-session',
      },
      {
        authorization: 'Bearer server-only-token',
        cookie: null,
        internalCall: null,
        method: 'GET',
        secret: null,
        url: 'https://omg-saas.internal/api/dashboard',
      },
    ]);
    expect(summary).toEqual({
      activeMachines: 1,
      expiresAt: '2027-01-01T00:00:00.000Z',
      maxMachines: 3,
      status: 'active',
      subscription: {
        cancelAtPeriodEnd: true,
        periodEnd: '2026-10-01T00:00:00.000Z',
        status: 'trialing',
      },
      tier: 'team',
      usage: {
        currentStreak: 7,
        packagesInstalled: 321,
        runtimeSwitches: 45,
        timeSavedMs: 3_660_000,
        topPackage: 'ripgrep',
        topRuntime: 'node',
        totalCommands: 12_345,
      },
    });
    expect(JSON.stringify(summary)).not.toContain('token');
    expect(JSON.stringify(summary)).not.toContain('license_key');
    expect(JSON.stringify(summary)).not.toContain('machine-1');
  });

  it.each(VALID_ROLES)('maps the %s auth role into the mint request', async role => {
    let mintBody: unknown;
    const service = serviceWith(
      () => new Response(null),
      () => Response.json(dashboardPayload())
    );
    service.fetch = async request => {
      if (new URL(request.url).pathname === '/api/internal/site-session') {
        mintBody = JSON.parse(await request.text());
        return Response.json({
          token: 'server-only-token',
          expiresAt: '2026-09-01T00:00:00.000Z',
          customerId: 'customer-1',
        });
      }
      return Response.json(dashboardPayload());
    };

    await Effect.runPromise(loadLicensingSummary(identity, environment(role, service)));

    expect(mintBody).toEqual({
      betterAuthUserId: identity.id,
      email: identity.email,
      name: identity.name,
      role,
    });
  });

  it('fails unverified and malformed-email identities before DB or service access', async () => {
    for (const rejectedIdentity of [
      { ...identity, emailVerified: false },
      { ...identity, email: 'not-an-email' },
    ]) {
      const service = serviceWith();
      let databaseCalls = 0;

      const exit = await Effect.runPromiseExit(
        loadLicensingSummary(
          rejectedIdentity,
          environment('user', service, () => {
            databaseCalls += 1;
          })
        )
      );

      expect(failureOf(exit)).toBeInstanceOf(LicensingSummaryInvalidInput);
      expect(databaseCalls).toBe(0);
      expect(service.requests).toHaveLength(0);
    }
  });

  it('accepts omission of dashboard fields irrelevant to the summary', async () => {
    const service = serviceWith(undefined, () =>
      Response.json({
        license: {
          tier: 'free',
          status: 'active',
          max_machines: 1,
          expires_at: null,
        },
        machines: [{}],
        usage: {
          total_commands: 0,
          total_packages_installed: 0,
          total_runtimes_switched: 0,
          total_time_saved_ms: 0,
          current_streak: 0,
        },
        global_stats: {
          top_package: null,
          top_runtime: null,
        },
        subscription: null,
      })
    );

    const summary = await Effect.runPromise(
      loadLicensingSummary(identity, environment('user', service))
    );

    expect(summary).toEqual({
      activeMachines: 1,
      expiresAt: null,
      maxMachines: 1,
      status: 'active',
      subscription: null,
      tier: 'free',
      usage: {
        currentStreak: 0,
        packagesInstalled: 0,
        runtimeSwitches: 0,
        timeSavedMs: 0,
        topPackage: null,
        topRuntime: null,
        totalCommands: 0,
      },
    });
  });

  it('rejects malformed and non-JSON service payloads', async () => {
    const malformed = serviceWith(undefined, () =>
      Response.json({ ...dashboardPayload(), license: { max_machines: -1 } })
    );
    const malformedExit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('user', malformed))
    );
    expect(failureOf(malformedExit)).toBeInstanceOf(LicensingSummaryInvalidPayload);

    const invalidUsage = serviceWith(undefined, () =>
      Response.json({
        ...dashboardPayload(),
        usage: { ...dashboardPayload().usage, total_commands: -1 },
      })
    );
    const invalidUsageExit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('user', invalidUsage))
    );
    expect(failureOf(invalidUsageExit)).toBeInstanceOf(LicensingSummaryInvalidPayload);

    const nonJson = serviceWith(() => new Response('not-json'));
    const nonJsonExit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('user', nonJson))
    );
    expect(failureOf(nonJsonExit)).toBeInstanceOf(LicensingSummaryInvalidPayload);

    const invalidRole = serviceWith();
    const invalidRoleExit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('owner', invalidRole))
    );
    expect(failureOf(invalidRoleExit)).toBeInstanceOf(LicensingSummaryInvalidInput);
    expect(invalidRole.requests).toHaveLength(0);
  });

  it('rejects oversized session and dashboard responses while streaming', async () => {
    const oversizedSession = serviceWith(() => new Response('x'.repeat(16 * 1024 + 1)));
    const sessionExit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('user', oversizedSession))
    );
    expect(failureOf(sessionExit)).toBeInstanceOf(LicensingSummaryBodyTooLarge);

    const service = serviceWith(undefined, () => new Response('x'.repeat(1024 * 1024 + 1)));

    const exit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('user', service))
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingSummaryBodyTooLarge);
  });

  it('grounds verification, success, and failure into serializable dashboard states', async () => {
    const service = serviceWith();
    await expect(
      loadLicensingSummaryState(identity, environment('user', service))
    ).resolves.toMatchObject({ status: 'available' });

    let databaseCalls = 0;
    await expect(
      loadLicensingSummaryState(
        { ...identity, emailVerified: false },
        environment('user', serviceWith(), () => {
          databaseCalls += 1;
        })
      )
    ).resolves.toEqual({ status: 'verification-required' });
    expect(databaseCalls).toBe(0);

    const unavailable = serviceWith();
    unavailable.fetch = async () => {
      throw new Error('binding unavailable');
    };
    await expect(
      loadLicensingSummaryState(identity, environment('user', unavailable))
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('returns a tagged failure when the service binding rejects', async () => {
    const service = serviceWith();
    service.fetch = async () => {
      throw new Error('binding unavailable');
    };

    const exit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('user', service))
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingSummaryServiceUnavailable);
  });
});
