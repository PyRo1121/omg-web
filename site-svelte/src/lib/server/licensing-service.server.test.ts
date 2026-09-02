import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  LicensingSummaryBodyTooLarge,
  LicensingSummaryInvalidInput,
  LicensingSummaryInvalidPayload,
  AdminOverviewForbidden,
  LicensingSummaryServiceUnavailable,
  claimMarketingOffer,
  loadAdminOverview,
  loadLicensingSummary,
  loadLicensingSummaryState,
  requireAdminServiceAccess,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
} from './licensing-service.server';
import { siteSessionResponse } from '../../../tests/test-utils';

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
  readonly requestBodies: Array<string> = [];
  readonly requests: Array<RecordedRequest> = [];
  readonly visitorIps: Array<string | null> = [];

  constructor(
    private readonly sessionResponse: () => Response,
    private readonly dashboardResponse: () => Response
  ) {}

  async fetch(request: Request): Promise<Response> {
    this.requestBodies.push(await request.clone().text());
    this.visitorIps.push(request.headers.get('X-Offer-Visitor-IP'));
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
    machines: [
      {
        id: 'machine-1',
        machine_id: 'private-machine-1',
        hostname: 'workstation',
        os: 'linux',
        arch: 'x86_64',
        omg_version: '1.4.0',
        last_seen_at: '2026-08-27T03:00:00.000Z',
        first_seen_at: '2026-08-01T00:00:00.000Z',
        is_active: 1,
      },
    ],
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
  session: () => Response = () => siteSessionResponse({ customerId: 'customer-1' }),
  dashboard: () => Response = () => Response.json(dashboardPayload())
): LicensingServiceStub {
  return new LicensingServiceStub(session, dashboard);
}

function failureOf(
  exit: Exit.Exit<unknown, LicensingSummaryError | AdminOverviewForbidden>
): LicensingSummaryError | AdminOverviewForbidden | null {
  return Exit.isSuccess(exit) ? null : Option.getOrNull(Cause.findErrorOption(exit.cause));
}

describe('requireAdminServiceAccess', () => {
  it('authorizes from the current D1 role without minting a Worker session', async () => {
    const service = serviceWith();

    await Effect.runPromise(requireAdminServiceAccess(identity, environment('admin', service)));
    const denied = await Effect.runPromiseExit(
      requireAdminServiceAccess(identity, environment('user', service))
    );

    expect(service.requests).toEqual([]);
    expect(failureOf(denied)).toBeInstanceOf(AdminOverviewForbidden);
  });
});

describe('claimMarketingOffer', () => {
  it('uses only the caller-specific secret over the private binding', async () => {
    const service = serviceWith(undefined, () =>
      Response.json({
        code: 'OMG20-ABCD2345',
        percentOff: 20,
        durationMonths: 3,
        expiresAt: '2026-09-27T00:00:00.000Z',
      })
    );

    const offer = await Effect.runPromise(
      claimMarketingOffer('Developer@Example.com', '192.0.2.10', environment('user', service))
    );

    expect(offer).toEqual({
      code: 'OMG20-ABCD2345',
      percentOff: 20,
      durationMonths: 3,
      expiresAt: '2026-09-27T00:00:00.000Z',
    });
    expect(service.requests).toEqual([
      {
        authorization: null,
        cookie: null,
        internalCall: 'service-binding',
        method: 'POST',
        secret: 'private-bff-secret',
        url: 'https://omg-saas.internal/api/internal/marketing-offer',
      },
    ]);
    expect(service.requestBodies).toEqual(['{"email":"developer@example.com"}']);
    expect(service.visitorIps).toEqual(['192.0.2.10']);
  });

  it('rejects malformed inputs before invoking the Worker', async () => {
    const service = serviceWith();
    const exit = await Effect.runPromiseExit(
      claimMarketingOffer('not-an-email', '', environment('user', service))
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(service.requests).toHaveLength(0);
  });
});

describe('loadAdminOverview', () => {
  it('projects high-signal metrics and recent activity without internal identifiers', async () => {
    const service = serviceWith();
    service.fetch = async request => {
      service.requests.push({
        authorization: request.headers.get('Authorization'),
        cookie: request.headers.get('Cookie'),
        internalCall: request.headers.get('X-Internal-Call'),
        method: request.method,
        secret: request.headers.get('X-Admin-Secret'),
        url: request.url,
      });
      const pathname = new URL(request.url).pathname;
      if (pathname === '/api/internal/site-session') {
        return siteSessionResponse({ customerId: 'customer-1' });
      }
      if (pathname === '/api/admin/activity') {
        return Response.json({
          request_id: 'request-activity',
          activity: [
            {
              id: 'audit-1',
              customer_id: 'private-customer-id',
              action: 'machine.registered',
              resource_type: 'machine',
              resource_id: 'private-machine-id',
              ip_address: '192.0.2.10',
              created_at: '2026-08-27T03:00:00.000Z',
            },
          ],
        });
      }
      return Response.json({
        request_id: 'request-overview',
        overview: {
          total_users: 12,
          active_licenses: 8,
          active_machines: 9,
          total_installs: 17,
          mrr: 999,
          global_value_usd: 123_456,
          command_health: { success: 103, failure: 2 },
        },
        fleet: { versions: [{ omg_version: '1.4.0', count: 6 }] },
        tiers: [
          { tier: 'free', count: 11 },
          { tier: 'enterprise', count: 1 },
        ],
        usage: {
          total_commands: 820,
          total_packages_installed: 140,
          total_searches: 44,
          total_time_saved_ms: 7_200_000,
        },
        daily_active_users: [
          { date: '2026-08-26', active_users: 3, commands: 90 },
          { date: '2026-08-27', active_users: 4, commands: 120 },
        ],
        recent_signups: [{ date: '2026-08-27', count: 2 }],
        installs_by_platform: [{ platform: 'linux', count: 15 }],
        installs_by_version: [{ version: '1.4.0', count: 12 }],
        subscriptions: [
          { status: 'active', count: 2 },
          { status: 'past_due', count: 1 },
        ],
        geo_distribution: [{ dimension: 'US', count: 5 }],
      });
    };

    const overview = await Effect.runPromise(
      loadAdminOverview(identity, environment('admin', service))
    );

    expect(overview).toEqual({
      activeLicenses: 8,
      activeMachines: 9,
      activity: [
        {
          action: 'machine.registered',
          createdAt: '2026-08-27T03:00:00.000Z',
          resourceType: 'machine',
        },
      ],
      commandFailure24h: 2,
      commandSuccess24h: 103,
      commands30d: 820,
      dailyActivity: [
        { activeUsers: 3, commands: 90, date: '2026-08-26' },
        { activeUsers: 4, commands: 120, date: '2026-08-27' },
      ],
      fleetVersions: [{ count: 6, label: '1.4.0' }],
      installsByPlatform: [{ count: 15, label: 'linux' }],
      packagesInstalled30d: 140,
      recentSignups: [{ count: 2, date: '2026-08-27' }],
      searches30d: 44,
      subscriptions: [
        { count: 2, label: 'active' },
        { count: 1, label: 'past_due' },
      ],
      tiers: [
        { count: 11, label: 'free' },
        { count: 1, label: 'enterprise' },
      ],
      timeSavedMs30d: 7_200_000,
      totalInstalls: 17,
      totalUsers: 12,
    });
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain('request-');
    expect(serialized).not.toContain('private-');
    expect(serialized).not.toContain('192.0.2.10');
    expect(serialized).not.toContain('globalValue');
    expect(serialized).not.toContain('mrr');
  });

  it('rejects non-admin roles before minting a Worker session', async () => {
    const service = serviceWith();
    const exit = await Effect.runPromiseExit(
      loadAdminOverview(identity, environment('user', service))
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Option.getOrNull(Cause.findErrorOption(exit.cause))).toBeInstanceOf(
        AdminOverviewForbidden
      );
    }
    expect(service.requests).toHaveLength(0);
  });
});

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
      machines: [
        {
          architecture: 'x86_64',
          firstSeenAt: '2026-08-01T00:00:00.000Z',
          hostname: 'workstation',
          lastSeenAt: '2026-08-27T03:00:00.000Z',
          operatingSystem: 'linux',
          version: '1.4.0',
        },
      ],
      isAdmin: true,
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
        return siteSessionResponse({ customerId: 'customer-1' });
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
        machines: [
          {
            hostname: '   ',
            os: null,
            arch: null,
            omg_version: null,
            last_seen_at: '2026-08-27T03:00:00.000Z',
            first_seen_at: '2026-08-01T00:00:00.000Z',
          },
        ],
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
        is_admin: false,
      })
    );

    const summary = await Effect.runPromise(
      loadLicensingSummary(identity, environment('user', service))
    );

    expect(summary).toEqual({
      activeMachines: 1,
      expiresAt: null,
      machines: [
        {
          architecture: null,
          firstSeenAt: '2026-08-01T00:00:00.000Z',
          hostname: null,
          lastSeenAt: '2026-08-27T03:00:00.000Z',
          operatingSystem: null,
          version: null,
        },
      ],
      isAdmin: false,
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

    const invalidMachineTimestamp = serviceWith(undefined, () =>
      Response.json({
        ...dashboardPayload(),
        machines: dashboardPayload().machines.map(machine => ({
          ...machine,
          last_seen_at: 'not-a-date',
        })),
      })
    );
    const invalidMachineExit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('user', invalidMachineTimestamp))
    );
    expect(failureOf(invalidMachineExit)).toBeInstanceOf(LicensingSummaryInvalidPayload);

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

    const sessionPrefix = new TextEncoder().encode('{"token":"');
    const sessionSuffix = new TextEncoder().encode(
      '","expiresAt":"2026-09-01T00:00:00.000Z","customerId":"customer-1"}'
    );
    const malformedUtf8Body = new Uint8Array(
      sessionPrefix.byteLength + 1 + sessionSuffix.byteLength
    );
    malformedUtf8Body.set(sessionPrefix);
    malformedUtf8Body[sessionPrefix.byteLength] = 0xff;
    malformedUtf8Body.set(sessionSuffix, sessionPrefix.byteLength + 1);
    const malformedUtf8 = serviceWith(() => new Response(malformedUtf8Body));
    const malformedUtf8Exit = await Effect.runPromiseExit(
      loadLicensingSummary(identity, environment('user', malformedUtf8))
    );
    expect(failureOf(malformedUtf8Exit)).toBeInstanceOf(LicensingSummaryInvalidPayload);

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
