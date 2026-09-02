import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  loadAdminCustomerDetailById,
  loadAdminCustomers,
  updateAdminCustomerLicense,
} from './admin-customers.server';
import {
  AdminOverviewForbidden,
  LicensingSummaryInvalidPayload,
  type LicensingSummaryEnvironment,
} from './licensing-service.server';
import { siteSessionResponse } from './test-utils';

const identity = {
  id: 'better-auth-user-1',
  email: 'operator@example.com',
  name: 'Operator',
  emailVerified: true,
};

interface RecordedRequest {
  readonly authorization: string | null;
  readonly body: string;
  readonly cookie: string | null;
  readonly pathname: string;
  readonly search: string;
}

class CustomerServiceStub {
  readonly requests: Array<RecordedRequest> = [];

  constructor(private readonly response: (request: Request) => Response) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.requests.push({
      authorization: request.headers.get('Authorization'),
      body: await request.clone().text(),
      cookie: request.headers.get('Cookie'),
      pathname: url.pathname,
      search: url.search,
    });
    return this.response(request);
  }
}

function sessionResponse(): Response {
  return siteSessionResponse({ customerId: 'operator-customer-id' });
}

function environment(
  service: CustomerServiceStub,
  role: 'user' | 'admin' = 'admin'
): LicensingSummaryEnvironment {
  return {
    DB: {
      prepare: sql => ({
        bind: (...bindings) => ({
          first: async () => {
            if (sql === 'SELECT role FROM auth_user WHERE id = ?') {
              expect(bindings).toEqual([identity.id]);
              return { role };
            }
            expect(sql).toBe('SELECT id FROM customers WHERE email = ?');
            expect(bindings).toEqual(['customer@example.com']);
            return { id: 'private-customer-id' };
          },
        }),
      }),
    },
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

describe('admin customer service', () => {
  it('loads a bounded directory without projecting database identifiers', async () => {
    const service = new CustomerServiceStub(request => {
      const url = new URL(request.url);
      if (url.pathname === '/api/internal/site-session') return sessionResponse();
      return Response.json({
        request_id: 'request-1',
        users: [
          {
            id: 'private-customer-id',
            email: 'customer@example.com',
            company: 'Acme',
            created_at: '2026-08-01 00:00:00',
            tier: 'team',
            license_status: 'active',
            machine_count: 3,
            total_commands: 1200,
            last_active_date: '2026-08-27',
            active_days_30d: 18,
            cmds_3d: 150,
            cmds_prev_7d: 210,
            velocity: 1.2,
            engagement_score: 84,
            lifecycle_stage: 'power_user',
          },
        ],
        pagination: { page: 2, limit: 25, total: 31, pages: 2 },
      });
    });

    const directory = await Effect.runPromise(
      loadAdminCustomers(identity, environment(service), 2, 'Acme')
    );

    expect(directory).toEqual({
      customers: [
        {
          activeDays30d: 18,
          activeMachines: 3,
          company: 'Acme',
          createdAt: '2026-08-01 00:00:00',
          email: 'customer@example.com',
          engagementScore: 84,
          lastActiveDate: '2026-08-27',
          lifecycleStage: 'power_user',
          status: 'active',
          tier: 'team',
          totalCommands: 1200,
        },
      ],
      pagination: { page: 2, pageSize: 25, total: 31, pages: 2 },
    });
    expect(JSON.stringify(directory)).not.toContain('private-customer-id');
    expect(service.requests[1]).toMatchObject({
      authorization: 'Bearer server-only-token',
      cookie: null,
      pathname: '/api/admin/users',
      search: '?page=2&limit=25&search=Acme',
    });
  });

  it('projects support detail without license, machine, or provider identifiers', async () => {
    const service = new CustomerServiceStub(request => {
      const url = new URL(request.url);
      if (url.pathname === '/api/internal/site-session') return sessionResponse();
      return Response.json({
        request_id: 'request-2',
        user: {
          id: 'private-customer-id',
          email: 'customer@example.com',
          company: 'Acme',
          tier: 'team',
          admin: 0,
          stripe_customer_id: 'cus_private',
          telemetry_opt_out: 1,
          created_at: '2026-08-01 00:00:00',
          updated_at: '2026-08-27 00:00:00',
        },
        license: {
          id: 'private-license-id',
          customer_id: 'private-customer-id',
          license_key: 'private-license-key',
          tier: 'team',
          status: 'active',
          max_seats: 5,
          max_machines: 8,
          expires_at: null,
          created_at: '2026-08-01 00:00:00',
        },
        machines: [
          {
            id: 'private-machine-row',
            license_id: 'private-license-id',
            machine_id: 'private-hardware-id',
            hostname: 'build-01',
            os: 'linux',
            arch: 'x86_64',
            omg_version: '1.4.0',
            user_name: 'Private Name',
            user_email: 'private-machine@example.com',
            is_active: 1,
            first_seen_at: '2026-08-01 00:00:00',
            last_seen_at: '2026-08-27 00:00:00',
          },
        ],
        usage: [
          {
            date: '2026-08-27',
            license_id: 'private-license-id',
            commands_run: 20,
            packages_installed: 4,
            packages_searched: 6,
            runtimes_switched: 1,
            sbom_generated: 2,
            vulnerabilities_found: 3,
            time_saved_ms: 60000,
          },
        ],
      });
    });

    const detail = await Effect.runPromise(
      loadAdminCustomerDetailById(
        environment(service),
        { role: 'admin', token: 'server-only-token' },
        'private-customer-id'
      )
    );

    expect(detail).toEqual({
      company: 'Acme',
      createdAt: '2026-08-01 00:00:00',
      email: 'customer@example.com',
      expiresAt: null,
      machines: [
        {
          active: true,
          architecture: 'x86_64',
          firstSeenAt: '2026-08-01 00:00:00',
          hostname: 'build-01',
          lastSeenAt: '2026-08-27 00:00:00',
          omgVersion: '1.4.0',
          operatingSystem: 'linux',
        },
      ],
      maxMachines: 8,
      maxSeats: 5,
      status: 'active',
      telemetryOptOut: true,
      billingLinked: true,
      tier: 'team',
      updatedAt: '2026-08-27 00:00:00',
      usage: [
        {
          commands: 20,
          date: '2026-08-27',
          packagesInstalled: 4,
          packagesSearched: 6,
          runtimesSwitched: 1,
          sbomsGenerated: 2,
          timeSavedMs: 60000,
          vulnerabilitiesFound: 3,
        },
      ],
    });
    const serialized = JSON.stringify(detail);
    for (const privateValue of [
      'private-customer-id',
      'private-license-id',
      'private-license-key',
      'private-hardware-id',
      'cus_private',
      'private-machine@example.com',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('rejects non-admins before calling the Worker', async () => {
    const service = new CustomerServiceStub(() => {
      throw new Error('Worker must not be called');
    });
    const exit = await Effect.runPromiseExit(
      loadAdminCustomers(identity, environment(service, 'user'), 1, '')
    );

    expect(
      Exit.isFailure(exit) &&
        Option.getOrNull(Cause.findErrorOption(exit.cause)) instanceof AdminOverviewForbidden
    ).toBe(true);
    expect(service.requests).toHaveLength(0);
  });

  it('resolves the private customer id server-side for audited license updates', async () => {
    const service = new CustomerServiceStub(request => {
      const url = new URL(request.url);
      return url.pathname === '/api/internal/site-session'
        ? sessionResponse()
        : Response.json({ success: true });
    });

    await Effect.runPromise(
      updateAdminCustomerLicense(identity, environment(service), {
        email: 'customer@example.com',
        tier: 'enterprise',
        status: 'active',
      })
    );

    expect(service.requests[1]).toMatchObject({
      authorization: 'Bearer server-only-token',
      cookie: null,
      pathname: '/api/admin/user',
    });
    expect(JSON.parse(service.requests[1]?.body ?? '')).toEqual({
      userId: 'private-customer-id',
      tier: 'enterprise',
      status: 'active',
    });
  });

  it('rejects malformed negative counters from the Worker', async () => {
    const service = new CustomerServiceStub(request => {
      const url = new URL(request.url);
      if (url.pathname === '/api/internal/site-session') return sessionResponse();
      return Response.json({
        users: [
          {
            id: 'private-customer-id',
            email: 'customer@example.com',
            company: null,
            created_at: null,
            tier: 'free',
            license_status: 'active',
            machine_count: -1,
            total_commands: 0,
            last_active_date: null,
            active_days_30d: 0,
            cmds_3d: 0,
            cmds_prev_7d: 0,
            velocity: 0,
            engagement_score: 0,
            lifecycle_stage: 'new',
          },
        ],
        pagination: { page: 1, limit: 25, total: 1, pages: 1 },
      });
    });
    const exit = await Effect.runPromiseExit(
      loadAdminCustomers(identity, environment(service), 1, '')
    );

    expect(
      Exit.isFailure(exit) &&
        Option.getOrNull(Cause.findErrorOption(exit.cause)) instanceof
          LicensingSummaryInvalidPayload
    ).toBe(true);
  });
});
