import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decodeStripeJson,
  StripeBalanceSchema,
  StripeCheckoutSessionSchema,
  StripeCustomerListSchema,
} from '../src/contracts/stripe';
import {
  CreatePolicyBodySchema,
  decodeStoredStringArray,
  decodeTeamControlsRowArray,
  NotificationSettingRowSchema,
} from '../src/contracts/team-controls';
import { SingleTelemetryRequestSchema } from '../src/contracts/cli-telemetry';
import { decodeJsonBody } from '../src/body';
import { MachineIdBodySchema, TrackingBatchSchema } from '../src/contracts/http-bodies';
import {
  AdminActivityRowSchema,
  AdminAuditLogRowSchema,
  AdminChurnRiskSegmentRowSchema,
  AdminCohortRowSchema,
  AdminCommandCountRowSchema,
  AdminCommandHeatmapRowSchema,
  AdminCustomerDetailRowSchema,
  AdminCustomerTagRowSchema,
  AdminDailyActiveRowSchema,
  AdminDateCountRowSchema,
  AdminErrorTypeCountRowSchema,
  AdminExpansionOpportunityRowSchema,
  AdminFlagRowSchema,
  AdminFleetVersionRowSchema,
  AdminGeoDimensionRowSchema,
  AdminLtvByTierRowSchema,
  AdminMachineRowSchema,
  AdminMonthlyRevenueRowSchema,
  AdminNoteRowSchema,
  AdminPlatformCountRowSchema,
  AdminRetentionCohortRowSchema,
  AdminRevenueByTierRowSchema,
  AdminRuntimeAdoptionRowSchema,
  AdminRuntimeUsageRowSchema,
  AdminStatusCountRowSchema,
  AdminTagCatalogRowSchema,
  AdminUsageDailyRowSchema,
  AdminUsersExportRowSchema,
  AdminUsersListRowSchema,
  AdminVersionCountRowSchema,
  AnalyticsSaltRowSchema,
  BillingCustomerRowSchema,
  CliGeoRowSchema,
  CountRowSchema,
  customerIsAdmin,
  decodeExtraRowArray,
  decodeOptionalExtraRow,
  decodeStoredProperties,
  DocsGeoRowSchema,
  DocsInteractionRowSchema,
  DocsPageviewsRowSchema,
  DocsPerformanceRowSchema,
  DocsReferrerRowSchema,
  DocsTopPageRowSchema,
  DocsUtmRowSchema,
  FirehoseEventRowSchema,
  GrowthRowSchema,
  InsightsStatsRowSchema,
  isTeamOrEnterpriseTier,
  LicenseIdTierRowSchema,
  LicenseSeatsRowSchema,
  LicenseTeamAuthRowSchema,
  MemberUsageRowSchema,
  PolicyRowSchema,
  PrivacyCommandRowSchema,
  PrivacyFeatureRowSchema,
  PrivacyMachineRowSchema,
  PrivacyPerformanceRowSchema,
  PrivacyProfileRowSchema,
  PrivacySessionRowSchema,
  TeamControlMemberRowSchema,
  UsageDailyRowSchema,
  SessionJoinRowSchema,
  SiteAnalyticsTotalsRowSchema,
  SiteDailyTrendRowSchema,
  SiteDeviceRowSchema,
  SiteGeoRowSchema,
  SiteRealtimeCountryRowSchema,
  SiteTopPageRowSchema,
  TeamMemberMachineRowSchema,
  TierCountRowSchema,
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

  it('rejects stored channels JSON that is corrupt', async () => {
    const exit = await Effect.runPromiseExit(decodeStoredStringArray('{', ['email']));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('uses the fallback when stored channels are missing', async () => {
    const channels = await Effect.runPromise(decodeStoredStringArray(undefined, ['email']));
    expect(channels).toEqual(['email']);
  });

  it('decodes notification setting rows and rejects a non-array result', async () => {
    const rows = await Effect.runPromise(
      decodeTeamControlsRowArray(NotificationSettingRowSchema, 'settings', [
        { type: 'member_inactive', enabled: 1, threshold: 7, channels: '["email"]' },
      ])
    );
    expect(rows[0]?.type).toBe('member_inactive');

    const invalid = await Effect.runPromiseExit(
      decodeTeamControlsRowArray(NotificationSettingRowSchema, 'settings', { nope: true })
    );
    expect(Exit.isFailure(invalid)).toBe(true);
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

  it('decodes stored firehose properties and rejects corrupt JSON', async () => {
    const empty = await Effect.runPromise(decodeStoredProperties(undefined));
    expect(empty).toEqual({});

    const parsed = await Effect.runPromise(decodeStoredProperties('{"ok":true}'));
    expect(parsed.ok).toBe(true);

    const corrupt = await Effect.runPromiseExit(decodeStoredProperties('{'));
    expect(Exit.isFailure(corrupt)).toBe(true);
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

  it('rejects an invalid session join row', async () => {
    const exit = await Effect.runPromiseExit(
      decodeOptionalExtraRow(SessionJoinRowSchema, 'session', { id: 1 })
    );
    expect(Exit.isFailure(exit)).toBe(true);
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
    const exit = await Effect.runPromiseExit(
      decodeOptionalExtraRow(LicenseIdTierRowSchema, 'license', { tier: 'team' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
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
    await expect(customerIsAdmin({ nope: true })).resolves.toBe(false);
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
    const exit = await Effect.runPromiseExit(
      decodeOptionalExtraRow(AdminFlagRowSchema, 'admin', { nope: true })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('remaining D1 result arrays', () => {
  it('decodes privacy export machine and command rows', async () => {
    const machines = await Effect.runPromiseExit(
      decodeExtraRowArray(PrivacyMachineRowSchema, 'machines', [
        {
          machine_id: 'm1',
          hostname: null,
          os: 'linux',
          arch: 'x64',
          omg_version: '0.1.0',
          activated_at: null,
          last_seen_at: '2026-08-17',
        },
      ])
    );
    expect(isSuccess(machines)).toBe(true);

    const commands = await Effect.runPromiseExit(
      decodeExtraRowArray(PrivacyCommandRowSchema, 'commands', [
        {
          command: 'search',
          subcommand: null,
          packages: null,
          duration_ms: 12,
          success: 1,
          timestamp: '2026-08-17T00:00:00.000Z',
        },
      ])
    );
    expect(isSuccess(commands)).toBe(true);
  });

  it('keeps privacy export nulls instead of rewriting them', async () => {
    const sessions = await Effect.runPromise(
      decodeExtraRowArray(PrivacySessionRowSchema, 'sessions', [
        {
          session_id: 's1',
          event_type: 'start',
          start_time: null,
          end_time: null,
          commands_run: null,
          duration_secs: null,
          timestamp: '2026-08-17T00:00:00.000Z',
        },
      ])
    );
    expect(sessions[0]?.start_time).toBeNull();
    expect(sessions[0]?.commands_run).toBeNull();
  });

  it('decodes privacy performance and feature aggregates', async () => {
    const performance = await Effect.runPromise(
      decodeExtraRowArray(PrivacyPerformanceRowSchema, 'perf', [
        { metric_type: 'search_latency', avg_duration_ms: 10.5, sample_count: 2 },
      ])
    );
    expect(performance[0]?.avg_duration_ms).toBe(10.5);

    const features = await Effect.runPromise(
      decodeExtraRowArray(PrivacyFeatureRowSchema, 'features', [
        { feature: 'sbom', enabled: 1, usage_count: 4, last_used: '2026-08-17' },
      ])
    );
    expect(features[0]?.enabled).toBe(1);
  });

  it('decodes dashboard daily usage and team policy/member rows', async () => {
    const daily = await Effect.runPromise(
      decodeExtraRowArray(UsageDailyRowSchema, 'daily', [
        { date: '2026-08-17', commands_run: null, time_saved_ms: 1000 },
      ])
    );
    expect(daily[0]?.commands_run).toBe(0);

    const policies = await Effect.runPromise(
      decodeExtraRowArray(PolicyRowSchema, 'policies', [
        {
          id: 'p1',
          scope: 'runtime',
          rule: 'allow',
          value: 'node',
          enforced: 1,
          created_at: '2026-08-17',
        },
      ])
    );
    expect(policies[0]?.scope).toBe('runtime');

    const members = await Effect.runPromise(
      decodeExtraRowArray(TeamControlMemberRowSchema, 'members', [
        {
          machine_id: 'm1',
          hostname: 'dev',
          os: 'linux',
          arch: 'x64',
          omg_version: '0.1.0',
          last_seen_at: '2026-08-17',
          first_seen_at: '2026-08-01',
          is_active: 1,
          total_commands: 9,
          total_time_saved_ms: 100,
          commands_last_7d: 3,
        },
      ])
    );
    expect(members[0]?.total_commands).toBe(9);
  });

  it('rejects a malformed privacy command export row', async () => {
    const exit = await Effect.runPromiseExit(
      decodeExtraRowArray(PrivacyCommandRowSchema, 'commands', [{ duration_ms: 12 }])
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('decodes admin CRM user, machine, usage, and activity rows', async () => {
    const users = await Effect.runPromise(
      decodeExtraRowArray(AdminUsersListRowSchema, 'users', [
        {
          id: 'c1',
          email: 'a@b.com',
          company: null,
          created_at: '2026-01-01',
          tier: 'pro',
          license_status: 'active',
          machine_count: 2,
          total_commands: null,
          last_active_date: null,
          active_days_30d: 4,
          cmds_3d: 1,
          cmds_prev_7d: 7,
          velocity: 0.5,
          engagement_score: 40,
          lifecycle_stage: 'active',
        },
      ])
    );
    expect(users[0]?.total_commands).toBe(0);
    expect(users[0]?.last_active_date).toBeNull();

    const machines = await Effect.runPromise(
      decodeExtraRowArray(AdminMachineRowSchema, 'machines', [
        {
          id: 'row1',
          license_id: 'l1',
          machine_id: 'm1',
          hostname: 'dev',
          os: 'linux',
          arch: 'x64',
          omg_version: '0.1.0',
          user_name: null,
          user_email: null,
          is_active: 1,
          first_seen_at: '2026-01-01',
          last_seen_at: '2026-08-17',
        },
      ])
    );
    expect(machines[0]?.license_id).toBe('l1');

    const usage = await Effect.runPromise(
      decodeExtraRowArray(AdminUsageDailyRowSchema, 'usage', [
        {
          date: '2026-08-17',
          license_id: 'l1',
          commands_run: 3,
          packages_installed: null,
          packages_searched: 1,
          runtimes_switched: 0,
          sbom_generated: 0,
          vulnerabilities_found: 0,
          time_saved_ms: 100,
        },
      ])
    );
    expect(usage[0]?.packages_installed).toBe(0);

    const activity = await Effect.runPromise(
      decodeExtraRowArray(AdminActivityRowSchema, 'activity', [
        {
          id: 'a1',
          customer_id: 'c1',
          action: 'login',
          resource_type: 'session',
          resource_id: null,
          ip_address: '1.1.1.1',
          created_at: '2026-08-17',
        },
      ])
    );
    expect(activity[0]?.action).toBe('login');
  });

  it('decodes admin notes and tags, and rejects a note without content', async () => {
    const notes = await Effect.runPromise(
      decodeExtraRowArray(AdminNoteRowSchema, 'notes', [
        {
          id: 'n1',
          customer_id: 'c1',
          author_id: 'admin',
          note_type: 'general',
          content: 'hello',
          is_pinned: 0,
          created_at: '2026-08-17',
          updated_at: '2026-08-17',
          author_email: 'admin@b.com',
        },
      ])
    );
    expect(notes[0]?.content).toBe('hello');

    const catalog = await Effect.runPromise(
      decodeExtraRowArray(AdminTagCatalogRowSchema, 'tags', [
        {
          id: 't1',
          name: 'vip',
          color: '#fff',
          description: null,
          created_by: null,
          created_at: '2026-08-17',
          usage_count: null,
        },
      ])
    );
    expect(catalog[0]?.usage_count).toBe(0);

    const assigned = await Effect.runPromise(
      decodeExtraRowArray(AdminCustomerTagRowSchema, 'customer-tags', [
        {
          id: 't1',
          name: 'vip',
          color: '#fff',
          description: null,
          created_by: null,
          created_at: '2026-08-17',
        },
      ])
    );
    expect(assigned[0]?.name).toBe('vip');

    const invalid = await Effect.runPromiseExit(
      decodeExtraRowArray(AdminNoteRowSchema, 'notes', [{ id: 'n1', customer_id: 'c1' }])
    );
    expect(Exit.isFailure(invalid)).toBe(true);
  });

  it('decodes admin dashboard analytics list rows', async () => {
    const daily = await Effect.runPromise(
      decodeExtraRowArray(AdminDailyActiveRowSchema, 'dau', [
        { date: '2026-08-17', active_users: 4, commands: null },
      ])
    );
    expect(daily[0]?.commands).toBe(0);

    const signups = await Effect.runPromise(
      decodeExtraRowArray(AdminDateCountRowSchema, 'signups', [{ date: null, count: 2 }])
    );
    expect(signups[0]?.date).toBeNull();

    const platforms = await Effect.runPromise(
      decodeExtraRowArray(AdminPlatformCountRowSchema, 'platforms', [
        { platform: 'linux', count: 3 },
      ])
    );
    expect(platforms[0]?.count).toBe(3);

    const versions = await Effect.runPromise(
      decodeExtraRowArray(AdminVersionCountRowSchema, 'versions', [{ version: '1.2.3', count: 1 }])
    );
    expect(versions[0]?.version).toBe('1.2.3');

    const statuses = await Effect.runPromise(
      decodeExtraRowArray(AdminStatusCountRowSchema, 'status', [{ status: 'active', count: 8 }])
    );
    expect(statuses[0]?.status).toBe('active');

    const fleet = await Effect.runPromise(
      decodeExtraRowArray(AdminFleetVersionRowSchema, 'fleet', [{ omg_version: '0.9.0', count: 5 }])
    );
    expect(fleet[0]?.omg_version).toBe('0.9.0');

    const geo = await Effect.runPromise(
      decodeExtraRowArray(AdminGeoDimensionRowSchema, 'geo', [{ dimension: 'US', count: 9 }])
    );
    expect(geo[0]?.dimension).toBe('US');
  });

  it('decodes admin command, error, runtime, cohort, and revenue rows', async () => {
    const commands = await Effect.runPromise(
      decodeExtraRowArray(AdminCommandCountRowSchema, 'commands', [
        { command: 'install', count: 12 },
      ])
    );
    expect(commands[0]?.command).toBe('install');

    const errors = await Effect.runPromise(
      decodeExtraRowArray(AdminErrorTypeCountRowSchema, 'errors', [
        { error_type: 'timeout', count: 2 },
      ])
    );
    expect(errors[0]?.error_type).toBe('timeout');

    const runtimes = await Effect.runPromise(
      decodeExtraRowArray(AdminRuntimeUsageRowSchema, 'runtimes', [
        { runtime: 'node', count: 4, machines: 2 },
      ])
    );
    expect(runtimes[0]?.machines).toBe(2);

    const cohorts = await Effect.runPromise(
      decodeExtraRowArray(AdminCohortRowSchema, 'cohorts', [
        { cohort_month: '2026-01', month_index: 0, active_users: 7 },
      ])
    );
    expect(cohorts[0]?.month_index).toBe(0);

    const monthly = await Effect.runPromise(
      decodeExtraRowArray(AdminMonthlyRevenueRowSchema, 'monthly', [
        { month: '2026-08', revenue: 99.5, transactions: 3 },
      ])
    );
    expect(monthly[0]?.revenue).toBe(99.5);

    const byTier = await Effect.runPromise(
      decodeExtraRowArray(AdminRevenueByTierRowSchema, 'by-tier', [
        { tier: 'pro', total_revenue: 27, customers: 3 },
      ])
    );
    expect(byTier[0]?.customers).toBe(3);
  });

  it('rejects malformed admin MRR and analytics rows instead of swallowing them', async () => {
    const badMrr = await Effect.runPromiseExit(
      decodeExtraRowArray(TierCountRowSchema, 'mrr', [{ count: 3 }])
    );
    expect(Exit.isFailure(badMrr)).toBe(true);

    const badDaily = await Effect.runPromiseExit(
      decodeExtraRowArray(AdminDailyActiveRowSchema, 'dau', [{ date: '2026-08-17' }])
    );
    expect(Exit.isFailure(badDaily)).toBe(true);

    const badRevenue = await Effect.runPromiseExit(
      decodeExtraRowArray(AdminMonthlyRevenueRowSchema, 'monthly', [
        { month: '2026-08', revenue: 'nine' },
      ])
    );
    expect(Exit.isFailure(badRevenue)).toBe(true);
  });

  it('decodes admin advanced-metrics list rows and rejects malformed heatmap cells', async () => {
    const retention = await Effect.runPromise(
      decodeExtraRowArray(AdminRetentionCohortRowSchema, 'retention', [
        { cohort_date: '2026-08-01', week_number: 0, retained_users: 4 },
      ])
    );
    expect(retention[0]?.retained_users).toBe(4);

    const ltv = await Effect.runPromise(
      decodeExtraRowArray(AdminLtvByTierRowSchema, 'ltv', [
        { tier: 'pro', customer_count: 3, avg_ltv: 18.5 },
      ])
    );
    expect(ltv[0]?.avg_ltv).toBe(18.5);

    const heatmap = await Effect.runPromise(
      decodeExtraRowArray(AdminCommandHeatmapRowSchema, 'heatmap', [
        { hour: '09', day_of_week: '1', event_count: null },
      ])
    );
    expect(heatmap[0]?.event_count).toBe(0);

    const runtimes = await Effect.runPromise(
      decodeExtraRowArray(AdminRuntimeAdoptionRowSchema, 'runtime-adoption', [
        { runtime: 'node', unique_users: 2, total_uses: 9 },
      ])
    );
    expect(runtimes[0]?.unique_users).toBe(2);

    const churn = await Effect.runPromise(
      decodeExtraRowArray(AdminChurnRiskSegmentRowSchema, 'churn', [
        { tier: 'pro', user_count: 1, risk_segment: 'high' },
      ])
    );
    expect(churn[0]?.risk_segment).toBe('high');

    const expansion = await Effect.runPromise(
      decodeExtraRowArray(AdminExpansionOpportunityRowSchema, 'expansion', [
        {
          email: 'a@example.com',
          tier: 'free',
          active_machines: 1,
          total_commands_30d: 800,
          opportunity_type: 'upsell_to_pro',
          priority: 'medium',
        },
      ])
    );
    expect(expansion[0]?.opportunity_type).toBe('upsell_to_pro');

    const badHeatmap = await Effect.runPromiseExit(
      decodeExtraRowArray(AdminCommandHeatmapRowSchema, 'heatmap', [{ hour: '09' }])
    );
    expect(Exit.isFailure(badHeatmap)).toBe(true);

    const badChurn = await Effect.runPromiseExit(
      decodeExtraRowArray(AdminChurnRiskSegmentRowSchema, 'churn', [{ tier: 'pro', user_count: 1 }])
    );
    expect(Exit.isFailure(badChurn)).toBe(true);
  });

  it('decodes admin users CSV and audit-log rows, and rejects index-style holes', async () => {
    const exported = await Effect.runPromise(
      decodeExtraRowArray(AdminUsersExportRowSchema, 'users-csv', [
        {
          id: 'c1',
          email: 'a@example.com',
          company: null,
          created_at: '2026-08-17',
          tier: 'pro',
          status: 'active',
          active_machines: 2,
          total_commands: null,
        },
      ])
    );
    expect(exported[0]?.total_commands).toBe(0);

    const logs = await Effect.runPromise(
      decodeExtraRowArray(AdminAuditLogRowSchema, 'audit', [
        {
          id: 'a1',
          customer_id: 'c1',
          user_email: null,
          action: 'login',
          ip_address: '127.0.0.1',
          metadata: '{}',
          created_at: '2026-08-17T00:00:00Z',
        },
      ])
    );
    expect(logs[0]?.user_email).toBeNull();

    const badExport = await Effect.runPromiseExit(
      decodeExtraRowArray(AdminUsersExportRowSchema, 'users-csv', [
        { email: 'a@example.com', active_machines: 1, total_commands: 2 },
      ])
    );
    expect(Exit.isFailure(badExport)).toBe(true);

    const badLog = await Effect.runPromiseExit(
      decodeExtraRowArray(AdminAuditLogRowSchema, 'audit', [{ id: 'a1', created_at: 'x' }])
    );
    expect(Exit.isFailure(badLog)).toBe(true);
  });

  it('decodes site and docs analytics list rows and rejects a geo row without a country', async () => {
    const siteGeo = await Effect.runPromise(
      decodeExtraRowArray(SiteGeoRowSchema, 'site-geo', [
        { country_code: 'US', visitors: 4, sessions: null, pageviews: 9 },
      ])
    );
    expect(siteGeo[0]?.sessions).toBe(0);

    const docsGeo = await Effect.runPromise(
      decodeExtraRowArray(DocsGeoRowSchema, 'docs-geo', [
        { country_code: 'DE', sessions: 2, pageviews: 5 },
      ])
    );
    expect(docsGeo[0]?.pageviews).toBe(5);

    const cliGeo = await Effect.runPromise(
      decodeExtraRowArray(CliGeoRowSchema, 'cli-geo', [{ country_code: 'CA', count: 3 }])
    );
    expect(cliGeo[0]?.count).toBe(3);

    const realtime = await Effect.runPromise(
      decodeExtraRowArray(SiteRealtimeCountryRowSchema, 'realtime', [
        { country_code: 'US', count: 2 },
      ])
    );
    expect(realtime[0]?.count).toBe(2);

    const trend = await Effect.runPromise(
      decodeExtraRowArray(SiteDailyTrendRowSchema, 'trend', [
        { date: '2026-08-17', pageviews: 10, visitors: 4 },
      ])
    );
    expect(trend[0]?.pageviews).toBe(10);

    const pages = await Effect.runPromise(
      decodeExtraRowArray(SiteTopPageRowSchema, 'pages', [{ path: '/', views: 8, visitors: 3 }])
    );
    expect(pages[0]?.views).toBe(8);

    const devices = await Effect.runPromise(
      decodeExtraRowArray(SiteDeviceRowSchema, 'devices', [{ device_type: 'desktop', visitors: 6 }])
    );
    expect(devices[0]?.device_type).toBe('desktop');

    const docsPages = await Effect.runPromise(
      decodeExtraRowArray(DocsTopPageRowSchema, 'docs-pages', [
        { path: '/install', views: 4, sessions: 2, avg_time: 1200 },
      ])
    );
    expect(docsPages[0]?.avg_time).toBe(1200);

    const referrers = await Effect.runPromise(
      decodeExtraRowArray(DocsReferrerRowSchema, 'docs-ref', [
        { referrer: 'google.com', sessions: 3, pageviews: 7 },
      ])
    );
    expect(referrers[0]?.referrer).toBe('google.com');

    const utm = await Effect.runPromise(
      decodeExtraRowArray(DocsUtmRowSchema, 'utm', [
        {
          utm_source: 'newsletter',
          utm_medium: 'email',
          utm_campaign: null,
          sessions: 1,
          pageviews: 2,
        },
      ])
    );
    expect(utm[0]?.utm_campaign).toBeNull();

    const interactions = await Effect.runPromise(
      decodeExtraRowArray(DocsInteractionRowSchema, 'interactions', [
        { interaction_type: 'click', target: 'cta', count: 9 },
      ])
    );
    expect(interactions[0]?.count).toBe(9);

    const performance = await Effect.runPromise(
      decodeExtraRowArray(DocsPerformanceRowSchema, 'perf', [
        { path: '/', avg_load: 200, p95_load: 400, samples: 12 },
      ])
    );
    expect(performance[0]?.samples).toBe(12);

    const pageviews = await Effect.runPromise(
      decodeExtraRowArray(DocsPageviewsRowSchema, 'pageviews', [
        { date: '2026-08-17', views: 5, sessions: 2 },
      ])
    );
    expect(pageviews[0]?.views).toBe(5);

    const badGeo = await Effect.runPromiseExit(
      decodeExtraRowArray(SiteGeoRowSchema, 'site-geo', [
        { visitors: 1, sessions: 1, pageviews: 1 },
      ])
    );
    expect(Exit.isFailure(badGeo)).toBe(true);
  });
});
