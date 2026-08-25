import * as Schema from 'effect/Schema';
import { NullableStringSchema } from './d1-rows';

const LicensingDashboardMachineSchema = Schema.Struct({
  id: Schema.String,
  machine_id: Schema.String,
  hostname: NullableStringSchema,
  os: NullableStringSchema,
  arch: NullableStringSchema,
  omg_version: NullableStringSchema,
  last_seen_at: Schema.String,
  first_seen_at: Schema.String,
  is_active: Schema.Number,
});

export const LicensingGlobalStatsSchema = Schema.Struct({
  top_package: Schema.NullOr(Schema.String),
  top_runtime: Schema.NullOr(Schema.String),
  percentile: Schema.NullOr(Schema.Number),
});

export const LicensingDashboardSchema = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    name: NullableStringSchema,
    avatar_url: NullableStringSchema,
    created_at: Schema.String,
  }),
  license: Schema.Struct({
    id: Schema.String,
    license_key: Schema.String,
    tier: Schema.String,
    status: Schema.String,
    max_machines: Schema.Number,
    expires_at: NullableStringSchema,
    features: Schema.Array(Schema.String),
  }),
  machines: Schema.Array(LicensingDashboardMachineSchema),
  usage: Schema.Struct({
    total_commands: Schema.Number,
    total_packages_installed: Schema.Number,
    total_packages_searched: Schema.Number,
    total_runtimes_switched: Schema.Number,
    total_sbom_generated: Schema.Number,
    total_vulnerabilities_found: Schema.Number,
    total_time_saved_ms: Schema.Number,
    current_streak: Schema.Number,
    longest_streak: Schema.Number,
    daily: Schema.Array(
      Schema.Struct({
        date: Schema.String,
        commands_run: Schema.Number,
        time_saved_ms: Schema.Number,
      })
    ),
    breakdown: Schema.Struct({
      installed: Schema.Number,
      searched: Schema.Number,
      switched: Schema.Number,
      sbom: Schema.Number,
      vulns: Schema.Number,
    }),
  }),
  achievements: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      emoji: Schema.String,
      name: Schema.String,
      description: Schema.String,
      unlocked: Schema.Boolean,
      unlocked_at: NullableStringSchema,
    })
  ),
  subscription: Schema.Union(
    Schema.Null,
    Schema.Struct({
      status: Schema.String,
      current_period_start: NullableStringSchema,
      current_period_end: NullableStringSchema,
      cancel_at_period_end: Schema.Number,
    })
  ),
  invoices: Schema.Array(Schema.Unknown),
  is_admin: Schema.Boolean,
  leaderboard: Schema.Array(
    Schema.Struct({
      user: Schema.String,
      time_saved: Schema.Number,
    })
  ),
  global_stats: LicensingGlobalStatsSchema,
});

export type LicensingDashboard = Schema.Schema.Type<typeof LicensingDashboardSchema>;
