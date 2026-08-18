import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decodeStripeJson,
  StripeBalanceSchema,
  StripeCheckoutSessionSchema,
  StripeCustomerListSchema,
} from '../src/contracts/stripe';
import { CreatePolicyBodySchema, decodeStoredStringArray } from '../src/contracts/team-controls';
import { SingleTelemetryRequestSchema } from '../src/contracts/cli-telemetry';
import { decodeJsonBody } from '../src/body';
import { MachineIdBodySchema, TrackingBatchSchema } from '../src/contracts/http-bodies';
import {
  AdminCustomerDetailRowSchema,
  AdminFlagRowSchema,
  AnalyticsSaltRowSchema,
  BillingCustomerRowSchema,
  CountRowSchema,
  customerIsAdmin,
  decodeExtraRowArray,
  decodeOptionalExtraRow,
  FirehoseEventRowSchema,
  GrowthRowSchema,
  InsightsStatsRowSchema,
  isTeamOrEnterpriseTier,
  LicenseIdTierRowSchema,
  LicenseSeatsRowSchema,
  LicenseTeamAuthRowSchema,
  MemberUsageRowSchema,
  PrivacyProfileRowSchema,
  SessionJoinRowSchema,
  SiteAnalyticsTotalsRowSchema,
  TeamMemberMachineRowSchema,
  TierRowSchema,
} from '../src/contracts/d1-extras';

function isSuccess<A, E>(exit: Exit.Exit<A, E>): boolean {
  return Exit.isSuccess(exit);
}

describe('Stripe JSON decode', () => {
  it('decodes a checkout session', async () => {
    const exit = await Effect.runPromiseExit(
      decodeStripeJson(StripeCheckoutSessionSchema, 'checkout', {
        id: 'cs_1',
        url: 'https://checkout.stripe.com/c/pay/cs_1',
      })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a customer list without data', async () => {
    const exit = await Effect.runPromiseExit(
      decodeStripeJson(StripeCustomerListSchema, 'customers', { has_more: false })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('sums typed balance amounts', async () => {
    const exit = await Effect.runPromiseExit(
      decodeStripeJson(StripeBalanceSchema, 'balance', {
        available: [{ amount: 100 }],
        pending: [{ amount: 25 }],
      })
    );
    expect(isSuccess(exit)).toBe(true);
    if (exit._tag !== 'Success') {
      return;
    }
    const available = exit.value.available.reduce((sum, funds) => sum + funds.amount, 0);
    expect(available).toBe(100);
  });
});

describe('team-controls JSON decode', () => {
  it('decodes a create-policy body', async () => {
    const request = new Request('https://api.pyro1121.com/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'runtime',
        rule: 'allow',
        value: 'node',
        enforced: true,
      }),
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, CreatePolicyBodySchema));
    expect(isSuccess(exit)).toBe(true);
  });

  it('falls back when stored channels JSON is corrupt', () => {
    expect(decodeStoredStringArray('{', ['email'])).toEqual(['email']);
  });
});

describe('CLI telemetry JSON decode', () => {
  it('decodes a command event', async () => {
    const request = new Request('https://api.pyro1121.com/api/cli/event', {
      method: 'POST',
      body: JSON.stringify({
        event: { type: 'command', command: 'search', success: true, subcommand: null },
        timestamp: '2026-08-17T00:00:00.000Z',
        machine_id: 'm1',
        version: '0.1.0',
        platform: 'linux',
        license_key: 'lic-1',
      }),
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, SingleTelemetryRequestSchema));
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a non-object event envelope', async () => {
    const request = new Request('https://api.pyro1121.com/api/cli/event', {
      method: 'POST',
      body: 'not-json',
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, SingleTelemetryRequestSchema));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('remaining HTTP bodies', () => {
  it('requires a machine_id', async () => {
    const request = new Request('https://api.pyro1121.com/api/machines/revoke', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, MachineIdBodySchema));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('decodes a tracking batch', async () => {
    const request = new Request('https://api.pyro1121.com/api/track', {
      method: 'POST',
      body: JSON.stringify({
        events: [
          {
            event_type: 'pageview',
            event_name: 'view',
            session_id: 's1',
            properties: { path: '/', referrer: 'https://example.com' },
          },
        ],
      }),
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, TrackingBatchSchema));
    expect(isSuccess(exit)).toBe(true);
  });
});

describe('firehose rows', () => {
  it('decodes analytics event rows', async () => {
    const exit = await Effect.runPromiseExit(
      decodeExtraRowArray(FirehoseEventRowSchema, 'firehose', [
        {
          id: 'e1',
          event_type: 'command',
          event_name: 'search',
          properties: '{"ok":true}',
          timestamp: '2026-08-17T00:00:00.000Z',
          session_id: 's1',
          machine_id: 'm1',
          version: '0.1.0',
          platform: 'linux',
          duration_ms: 10,
          created_at: '2026-08-17T00:00:00.000Z',
        },
      ])
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a non-array results value', async () => {
    const exit = await Effect.runPromiseExit(
      decodeExtraRowArray(FirehoseEventRowSchema, 'firehose', { nope: true })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('optional extra rows', () => {
  it('decodes a COUNT aggregate', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(CountRowSchema, 'count', { count: 4 })
    );
    expect(row?.count).toBe(4);
  });

  it('returns undefined for a missing first() row', async () => {
    const row = await Effect.runPromise(decodeOptionalExtraRow(CountRowSchema, 'count', undefined));
    expect(row).toBeUndefined();
  });

  it('decodes a session join row', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(SessionJoinRowSchema, 'session', {
        id: 's1',
        token: 'tok',
        expires_at: '2026-01-01T00:00:00.000Z',
        customer_id: 'c1',
        email: 'a@b.com',
        company: null,
        stripe_customer_id: null,
        customer_created_at: '2026-01-01T00:00:00.000Z',
      })
    );
    expect(row?.email).toBe('a@b.com');
  });

  it('returns undefined for an invalid session join row', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(SessionJoinRowSchema, 'session', { id: 1 })
    );
    expect(row).toBeUndefined();
  });

  it('decodes a salt blob from ArrayBuffer', async () => {
    const salt = new Uint8Array([1, 2, 3]).buffer;
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(AnalyticsSaltRowSchema, 'salt', { salt })
    );
    expect(row?.salt.byteLength).toBe(3);
  });

  it('decodes site analytics totals', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(SiteAnalyticsTotalsRowSchema, 'totals', {
        total_pageviews: 10,
        total_visitors: 4,
        total_sessions: 5,
      })
    );
    expect(row?.total_visitors).toBe(4);
  });

  it('decodes an id/tier license row used for authorization', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(LicenseIdTierRowSchema, 'license', { id: 'lic_1', tier: 'team' })
    );
    expect(row?.id).toBe('lic_1');
    expect(isTeamOrEnterpriseTier(row?.tier ?? '')).toBe(true);
  });

  it('rejects a license row without an id', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(LicenseIdTierRowSchema, 'license', { tier: 'team' })
    );
    expect(row).toBeUndefined();
  });

  it('decodes seat counts from an active license', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(LicenseSeatsRowSchema, 'seats', {
        id: 'lic_1',
        tier: 'enterprise',
        max_seats: null,
        used_seats: 3,
      })
    );
    expect(row?.max_seats).toBe(0);
    expect(row?.used_seats).toBe(3);
  });

  it('decodes a dashboard team license and member usage', async () => {
    const license = await Effect.runPromise(
      decodeOptionalExtraRow(LicenseTeamAuthRowSchema, 'team-license', {
        id: 'lic_1',
        tier: 'team',
        status: 'active',
        max_seats: 25,
      })
    );
    expect(license?.status).toBe('active');

    const machines = await Effect.runPromise(
      decodeExtraRowArray(TeamMemberMachineRowSchema, 'machines', [
        {
          id: 'row_1',
          machine_id: 'm1',
          hostname: 'box',
          os: 'linux',
          arch: 'x64',
          omg_version: '1.0.0',
          user_name: null,
          user_email: null,
          is_active: 1,
          first_seen_at: '2026-01-01T00:00:00.000Z',
          last_seen_at: '2026-01-02T00:00:00.000Z',
        },
      ])
    );
    expect(machines[0]?.machine_id).toBe('m1');

    const usage = await Effect.runPromise(
      decodeOptionalExtraRow(MemberUsageRowSchema, 'usage', {
        machine_id: 'm1',
        total_commands: 9,
        total_packages: 2,
        total_time_saved_ms: 1000,
        last_active: '2026-01-02',
      })
    );
    expect(usage?.total_commands).toBe(9);
  });

  it('decodes a tier-only license lookup', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(TierRowSchema, 'tier', { tier: 'enterprise' })
    );
    expect(isTeamOrEnterpriseTier(row?.tier ?? '')).toBe(true);
  });

  it('treats admin = 1 as authorized', async () => {
    await expect(customerIsAdmin({ admin: 1 })).resolves.toBe(true);
    await expect(customerIsAdmin({ admin: 0 })).resolves.toBe(false);
    await expect(customerIsAdmin(null)).resolves.toBe(false);
  });

  it('decodes an admin customer detail row', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(AdminCustomerDetailRowSchema, 'customer', {
        id: 'c1',
        email: 'a@b.com',
        company: null,
        tier: 'pro',
        admin: 0,
        stripe_customer_id: null,
        telemetry_opt_out: 0,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      })
    );
    expect(row?.email).toBe('a@b.com');
  });

  it('decodes growth and insights aggregate rows', async () => {
    const growth = await Effect.runPromise(
      decodeOptionalExtraRow(GrowthRowSchema, 'growth', { new_users_7d: 3, new_paid_7d: null })
    );
    expect(growth?.new_users_7d).toBe(3);
    expect(growth?.new_paid_7d).toBe(0);

    const stats = await Effect.runPromise(
      decodeOptionalExtraRow(InsightsStatsRowSchema, 'stats', {
        users: 10,
        cmds: 20,
        time_ms: 3600000,
        top_error: null,
        version_drift_count: 2,
      })
    );
    expect(stats?.cmds).toBe(20);
  });

  it('decodes billing and privacy profile lookups', async () => {
    const billing = await Effect.runPromise(
      decodeOptionalExtraRow(BillingCustomerRowSchema, 'billing', {
        id: 'c1',
        email: 'a@b.com',
        stripe_customer_id: 'cus_1',
      })
    );
    expect(billing?.id).toBe('c1');

    const profile = await Effect.runPromise(
      decodeOptionalExtraRow(PrivacyProfileRowSchema, 'profile', {
        id: 'c1',
        email: 'a@b.com',
        company: 'Acme',
        tier: 'pro',
        stripe_customer_id: null,
        created_at: '2026-01-01',
      })
    );
    expect(profile?.company).toBe('Acme');
  });

  it('rejects an admin flag row without admin', async () => {
    const row = await Effect.runPromise(
      decodeOptionalExtraRow(AdminFlagRowSchema, 'admin', { nope: true })
    );
    expect(row).toBeUndefined();
  });
});
