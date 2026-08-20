import { Schema } from '@effect/schema';

const NullableString = Schema.Union(Schema.Null, Schema.String);

export const LicensingDashboardMachineSchema = Schema.Struct({
  id: Schema.String,
  machine_id: Schema.String,
  hostname: NullableString,
  os: NullableString,
  arch: NullableString,
  omg_version: NullableString,
  last_seen_at: Schema.String,
  first_seen_at: Schema.String,
  is_active: Schema.Number,
});

export const LicensingDashboardSchema = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    name: NullableString,
    avatar_url: NullableString,
    created_at: Schema.String,
  }),
  license: Schema.Struct({
    id: Schema.String,
    license_key: Schema.String,
    tier: Schema.String,
    status: Schema.String,
    max_machines: Schema.Number,
    expires_at: NullableString,
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
      unlocked_at: NullableString,
    })
  ),
  subscription: Schema.Union(
    Schema.Null,
    Schema.Struct({
      status: Schema.String,
      current_period_start: NullableString,
      current_period_end: NullableString,
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
  global_stats: Schema.Struct({
    top_package: Schema.String,
    top_runtime: Schema.String,
    percentile: Schema.Number,
  }),
});

export type LicensingDashboard = Schema.Schema.Type<typeof LicensingDashboardSchema>;
