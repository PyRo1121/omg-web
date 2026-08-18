// Boundary parser internals decode SolidStart D1/drizzle rows.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe D1 boundary parsing requires these operations.

import { Effect, Exit } from 'effect';
import { Schema } from '@effect/schema';

/** A failure decoding a persisted D1/drizzle row. */
export class D1RowParseError extends Error {
  readonly _tag = 'D1RowParseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

const D1Number = Schema.Union(Schema.Number, Schema.Null).pipe(
  Schema.transform(Schema.Number, {
    decode: (fromA: number | null) => (fromA === null ? 0 : fromA),
    encode: (toI: number) => toI,
  })
);

const D1Boolean = Schema.Union(Schema.Boolean, Schema.Literal(0), Schema.Literal(1)).pipe(
  Schema.transform(Schema.Boolean, {
    decode: (fromA: boolean | 0 | 1) => fromA === true || fromA === 1,
    encode: (toI: boolean) => toI,
  })
);

const D1Timestamp = Schema.Union(
  Schema.instanceOf(Date),
  Schema.Number.pipe(
    Schema.transform(Schema.instanceOf(Date), {
      decode: (fromA: number) => new Date(fromA),
      encode: (toI: Date) => toI.getTime(),
    })
  )
);

const NullableString = Schema.Union(Schema.Null, Schema.String);
const NullableNumber = Schema.Union(Schema.Null, Schema.Number);
const NullableTimestamp = Schema.Union(Schema.Null, D1Timestamp);

/** Decode a single D1/drizzle row. */
export function decodeD1Row<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<Schema.Schema.Type<S>, D1RowParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause: unknown): D1RowParseError => new D1RowParseError(reason, cause))
  );
}

/** Decode a drizzle `.all()` list. Missing becomes `[]`. A non-array fails. */
export function decodeD1RowArray<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, D1RowParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed([]);
  }
  if (!Array.isArray(value)) {
    return Effect.fail(new D1RowParseError(reason));
  }
  return Effect.forEach(value, row => decodeD1Row(schema, reason, row));
}

/** Decode a drizzle `.get()` row. Missing stays missing. Malformed fails. */
export function decodeOptionalD1Row<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<Schema.Schema.Type<S> | undefined, D1RowParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed(undefined);
  }
  return decodeD1Row(schema, reason, value);
}

/** Outcome of reading an optional D1 `.get()` row. */
export type OptionalD1Row<A> =
  | { readonly _tag: 'present'; readonly value: A }
  | { readonly _tag: 'missing' }
  | { readonly _tag: 'invalid' };

/** Read an optional D1 `.get()` row without treating malformed data as missing. */
export async function readOptionalD1Row<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Promise<OptionalD1Row<Schema.Schema.Type<S>>> {
  const exit = await Effect.runPromiseExit(decodeOptionalD1Row(schema, reason, value));
  if (Exit.isFailure(exit)) {
    return { _tag: 'invalid' };
  }
  if (exit.value === undefined) {
    return { _tag: 'missing' };
  }
  return { _tag: 'present', value: exit.value };
}

/** Outcome of reading a D1 `.all()` list. */
export type D1RowList<A> =
  { readonly _tag: 'ok'; readonly value: ReadonlyArray<A> } | { readonly _tag: 'invalid' };

/** Read a D1 `.all()` list. A non-array or any bad row is invalid. */
export async function readD1RowArray<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Promise<D1RowList<Schema.Schema.Type<S>>> {
  const exit = await Effect.runPromiseExit(decodeD1RowArray(schema, reason, value));
  if (Exit.isFailure(exit)) {
    return { _tag: 'invalid' };
  }
  return { _tag: 'ok', value: exit.value };
}

/** The row value when present, otherwise undefined. */
export function optionalD1RowValue<A>(row: OptionalD1Row<A>): A | undefined {
  return row._tag === 'present' ? row.value : undefined;
}

/** Whether an optional-row outcome is a malformed persisted row. */
export function isInvalidD1Row(row: OptionalD1Row<unknown>): row is { readonly _tag: 'invalid' } {
  return row._tag === 'invalid';
}

/** Existence-only identifier row. */
export const IdRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
});
export type IdRow = Schema.Schema.Type<typeof IdRowSchema>;

/** COUNT(*) aggregate. */
export const CountRowSchema = Schema.Struct({
  count: D1Number,
});
export type CountRow = Schema.Schema.Type<typeof CountRowSchema>;

/** Admin/user role flag used by SolidStart admin checks. */
export const UserRoleRowSchema = Schema.Struct({
  role: Schema.Union(Schema.Literal('user'), Schema.Literal('admin')),
});
export type UserRoleRow = Schema.Schema.Type<typeof UserRoleRowSchema>;

/** License row used by dashboard, CLI, and telemetry routes. */
export const LicenseRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  userId: Schema.String.pipe(Schema.minLength(1)),
  licenseKey: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
  status: Schema.String,
  maxMachines: Schema.Number,
  expiresAt: Schema.optional(NullableTimestamp),
});
export type LicenseRow = Schema.Schema.Type<typeof LicenseRowSchema>;

/** License lookup for CLI validate-license. */
export const LicenseValidateRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
  status: Schema.String,
  maxMachines: Schema.Number,
  expiresAt: Schema.optional(NullableTimestamp),
});

/** Machine row used by dashboard and CLI routes. */
export const MachineRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  licenseId: Schema.optional(Schema.String),
  machineId: Schema.String.pipe(Schema.minLength(1)),
  hostname: Schema.optional(NullableString),
  os: Schema.optional(NullableString),
  arch: Schema.optional(NullableString),
  omgVersion: Schema.optional(NullableString),
  isActive: D1Boolean,
  firstSeenAt: Schema.optional(D1Timestamp),
  lastSeenAt: D1Timestamp,
});
export type MachineRow = Schema.Schema.Type<typeof MachineRowSchema>;

/** Session row used by the account dashboard. */
export const SessionRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  token: Schema.String,
  ipAddress: Schema.optional(NullableString),
  userAgent: Schema.optional(NullableString),
  createdAt: D1Timestamp,
  expiresAt: D1Timestamp,
});
export type SessionRow = Schema.Schema.Type<typeof SessionRowSchema>;

/** OAuth/account row used by the account dashboard. */
export const AccountRowSchema = Schema.Struct({
  providerId: Schema.String,
  accountId: Schema.String,
});
export type AccountRow = Schema.Schema.Type<typeof AccountRowSchema>;

/** Daily usage table row. */
export const UsageDailyRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  licenseId: Schema.optional(Schema.String),
  date: Schema.String,
  commandsRun: Schema.Number,
  packagesInstalled: Schema.Number,
  packagesSearched: Schema.Number,
  runtimesSwitched: Schema.Number,
  sbomGenerated: Schema.Number,
  vulnerabilitiesFound: Schema.Number,
  timeSavedMs: Schema.Number,
});
export type UsageDailyRow = Schema.Schema.Type<typeof UsageDailyRowSchema>;

/** Achievement progress join used by the telemetry dashboard. */
export const UserAchievementJoinRowSchema = Schema.Struct({
  id: Schema.String,
  achievementId: Schema.String,
  progress: Schema.Number,
  isUnlocked: D1Boolean,
  unlockedAt: Schema.optional(NullableTimestamp),
  name: Schema.String,
  description: Schema.String,
  icon: Schema.String,
  category: Schema.String,
  points: Schema.Number,
});

/** User achievement table row used by CLI report-usage. */
export const UserAchievementRowSchema = Schema.Struct({
  id: Schema.String,
  isUnlocked: D1Boolean,
});

/** Telemetry dashboard usage totals. */
export const UsageTotalsRowSchema = Schema.Struct({
  totalCommands: D1Number,
  totalPackagesInstalled: D1Number,
  totalPackagesSearched: D1Number,
  totalRuntimesSwitched: D1Number,
  totalSbomGenerated: D1Number,
  totalVulnerabilitiesFound: D1Number,
  totalTimeSavedMs: D1Number,
});

/** Week-over-week command/time aggregate. */
export const WeekStatsRowSchema = Schema.Struct({
  totalCommands: D1Number,
  totalTimeSaved: D1Number,
});

/** Single SUM(commands) aggregate. */
export const TotalCommandsRowSchema = Schema.Struct({
  totalCommands: D1Number,
});

/** Time-saved aggregate. */
export const TimeSavedRowSchema = Schema.Struct({
  totalTimeSaved: D1Number,
});

/** Command usage history item. */
export const CommandHistoryRowSchema = Schema.Struct({
  id: Schema.String,
  command: Schema.String,
  packageName: Schema.optional(NullableString),
  runtimeName: Schema.optional(NullableString),
  success: D1Boolean,
  durationMs: Schema.optional(NullableNumber),
  createdAt: D1Timestamp,
});

/** Distinct command name. */
export const CommandNameRowSchema = Schema.Struct({
  command: Schema.String,
});

/** Command count distribution. */
export const CommandCountRowSchema = Schema.Struct({
  command: Schema.String,
  count: D1Number,
});

/** Feature-adoption aggregate. */
export const FeatureUsageRowSchema = Schema.Struct({
  count: D1Number,
  lastUsed: Schema.optional(NullableTimestamp),
});

/** Daily usage chart row. */
export const DailyUsageChartRowSchema = Schema.Struct({
  date: Schema.String,
  commands: Schema.Number,
  timeSavedMs: Schema.Number,
});

/** Command performance aggregate. */
export const CommandPerformanceRowSchema = Schema.Struct({
  command: Schema.String,
  avgDuration: D1Number,
  minDuration: D1Number,
  maxDuration: D1Number,
  count: D1Number,
  successCount: D1Number,
});

/** Daily performance trend. */
export const DailyPerformanceRowSchema = Schema.Struct({
  date: Schema.String,
  command: Schema.String,
  avgDuration: D1Number,
});

/** Admin user list row. */
export const AdminUserListRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Schema.Union(Schema.Literal('user'), Schema.Literal('admin')),
  emailVerified: D1Boolean,
  createdAt: D1Timestamp,
  updatedAt: D1Timestamp,
});

/** Usage totals for an admin user card. */
export const AdminUserUsageRowSchema = Schema.Struct({
  totalCommands: D1Number,
  totalPackages: D1Number,
});

/** License id + userId pair. */
export const LicenseUserIdRowSchema = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
});

/** Signup cohort user. */
export const CohortUserRowSchema = Schema.Struct({
  id: Schema.String,
  createdAt: D1Timestamp,
});

/** Cohort usage slice. */
export const CohortUsageRowSchema = Schema.Struct({
  licenseId: Schema.String,
  date: Schema.String,
  commandsRun: Schema.Number,
});

/** Named count (tier/status/os). */
export const NamedCountRowSchema = Schema.Struct({
  count: D1Number,
});

/** License tier count. */
export const LicenseTierCountRowSchema = Schema.Struct({
  tier: Schema.String,
  count: D1Number,
});

/** License status count. */
export const LicenseStatusCountRowSchema = Schema.Struct({
  status: Schema.String,
  count: D1Number,
});

/** Last-30-days usage totals. */
export const Last30DaysStatsRowSchema = Schema.Struct({
  totalCommands: D1Number,
  totalPackagesInstalled: D1Number,
  totalPackagesSearched: D1Number,
  totalRuntimesSwitched: D1Number,
  totalTimeSaved: D1Number,
});

/** Admin analytics daily trend. */
export const DailyTrendRowSchema = Schema.Struct({
  date: Schema.String,
  commands: D1Number,
  packages: D1Number,
});

/** CRM note with author. */
export const CustomerNoteJoinRowSchema = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  noteType: Schema.String,
  isPinned: D1Boolean,
  createdAt: D1Timestamp,
  updatedAt: D1Timestamp,
  authorId: Schema.String,
  authorName: Schema.String,
  authorEmail: Schema.String,
});

/** Customer note table row. */
export const CustomerNoteRowSchema = Schema.Struct({
  id: Schema.String,
  content: Schema.optional(Schema.String),
  noteType: Schema.optional(Schema.String),
  isPinned: Schema.optional(D1Boolean),
});

/** Assigned customer tag. */
export const AssignedTagRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  description: Schema.optional(NullableString),
  assignedAt: D1Timestamp,
  assignedById: Schema.String,
});

/** Tag identity used when updating a catalog tag. */
export const CustomerTagNameRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});

/** Tag catalog row. */
export const TagCatalogRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  description: Schema.optional(NullableString),
  createdAt: D1Timestamp,
  usageCount: D1Number,
});

/** Customer identity used by CRM. */
export const CustomerIdentityRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
});

/** Health history point. */
export const HealthHistoryRowSchema = Schema.Struct({
  id: Schema.String,
  overallScore: Schema.Number,
  engagementScore: Schema.Number,
  activationScore: Schema.Number,
  growthScore: Schema.Number,
  riskScore: Schema.Number,
  lifecycleStage: Schema.String,
  churnProbability: Schema.Number,
  upgradeProbability: Schema.Number,
  commandVelocity7d: Schema.Number,
  recordedAt: D1Timestamp,
});

/** Health history period stats. */
export const HealthStatsRowSchema = Schema.Struct({
  minScore: D1Number,
  maxScore: D1Number,
  avgScore: D1Number,
  minChurn: D1Number,
  maxChurn: D1Number,
  avgChurn: D1Number,
  recordCount: D1Number,
});

/** Health export join, including optional license fields. */
export const HealthExportRowSchema = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.optional(NullableString),
  tier: Schema.optional(NullableString),
  status: Schema.optional(NullableString),
  overallScore: Schema.Number,
  engagementScore: Schema.Number,
  activationScore: Schema.Number,
  growthScore: Schema.Number,
  riskScore: Schema.Number,
  lifecycleStage: Schema.String,
  churnProbability: Schema.Number,
  upgradeProbability: Schema.Number,
  commandVelocity7d: Schema.Number,
  recordedAt: D1Timestamp,
});

/** Usage export join. */
export const UsageExportRowSchema = Schema.Struct({
  date: Schema.String,
  userId: Schema.String,
  email: Schema.String,
  name: Schema.optional(NullableString),
  tier: Schema.String,
  status: Schema.String,
  commandsRun: Schema.Number,
  packagesInstalled: Schema.Number,
  packagesSearched: Schema.Number,
  runtimesSwitched: Schema.Number,
  sbomGenerated: Schema.Number,
  vulnerabilitiesFound: Schema.Number,
  timeSavedMs: Schema.Number,
});

/** Geo country aggregate. */
export const GeoCountryRowSchema = Schema.Struct({
  countryCode: Schema.String,
  uniqueUsers: D1Number,
  totalSessions: D1Number,
});

/** Geo region aggregate. */
export const GeoRegionRowSchema = Schema.Struct({
  countryCode: Schema.String,
  region: Schema.optional(NullableString),
  uniqueUsers: D1Number,
});

/** Geo timezone aggregate. */
export const GeoTimezoneRowSchema = Schema.Struct({
  timezone: Schema.optional(NullableString),
  uniqueUsers: D1Number,
});

/** Geo city aggregate. */
export const GeoCityRowSchema = Schema.Struct({
  countryCode: Schema.String,
  city: Schema.optional(NullableString),
  uniqueUsers: D1Number,
});

/** Geo totals. */
export const GeoTotalsRowSchema = Schema.Struct({
  totalCountries: D1Number,
  totalUsers: D1Number,
  totalRegions: D1Number,
});

/** OS count. */
export const OsCountRowSchema = Schema.Struct({
  os: Schema.optional(NullableString),
  count: D1Number,
});

/** Admin command distribution. */
export const AdminCommandDistRowSchema = Schema.Struct({
  command: Schema.String,
  count: D1Number,
  successCount: D1Number,
  failureCount: D1Number,
  avgDurationMs: D1Number,
});

/** Popular package aggregate. */
export const PopularPackageRowSchema = Schema.Struct({
  packageName: Schema.optional(NullableString),
  count: D1Number,
  uniqueUsers: D1Number,
});

/** Command trend point. */
export const CommandTrendRowSchema = Schema.Struct({
  date: Schema.String,
  command: Schema.String,
  count: D1Number,
});

/** Runtime usage aggregate. */
export const RuntimeUsageRowSchema = Schema.Struct({
  runtimeName: Schema.optional(NullableString),
  count: D1Number,
  uniqueUsers: D1Number,
});

/** Admin command overall stats. */
export const AdminCommandOverallRowSchema = Schema.Struct({
  totalCommands: D1Number,
  totalPackagesInstalled: D1Number,
  totalPackagesSearched: D1Number,
  totalRuntimesSwitched: D1Number,
  totalSbomGenerated: D1Number,
  uniqueLicenses: D1Number,
});

/** Admin daily command totals. */
export const AdminDailyTotalsRowSchema = Schema.Struct({
  date: Schema.String,
  commands: D1Number,
  packages: D1Number,
  searches: D1Number,
});

/** Latest health score list row. */
export const LatestHealthRowSchema = Schema.Struct({
  userId: Schema.String,
  overallScore: Schema.Number,
  engagementScore: Schema.Number,
  activationScore: Schema.Number,
  growthScore: Schema.Number,
  riskScore: Schema.Number,
  lifecycleStage: Schema.String,
  churnProbability: Schema.Number,
  upgradeProbability: Schema.Number,
  commandVelocity7d: Schema.Number,
  recordedAt: D1Timestamp,
});

/** Score distribution bucket. */
export const ScoreBucketRowSchema = Schema.Struct({
  bucket: Schema.String,
  count: D1Number,
});

/** Lifecycle distribution. */
export const LifecycleDistRowSchema = Schema.Struct({
  stage: Schema.String,
  count: D1Number,
  avgScore: D1Number,
});

/** At-risk customer row. */
export const AtRiskCustomerRowSchema = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.optional(NullableString),
  overallScore: Schema.Number,
  churnProbability: Schema.Number,
  lifecycleStage: Schema.String,
  commandVelocity7d: Schema.Number,
  tier: Schema.optional(NullableString),
});

/** Latest-health averages across customers. */
export const AvgHealthScoresRowSchema = Schema.Struct({
  avgOverall: D1Number,
  avgEngagement: D1Number,
  avgActivation: D1Number,
  avgGrowth: D1Number,
  avgRisk: D1Number,
  avgChurnProb: D1Number,
  totalUsers: D1Number,
});

/** Upgrade opportunity row. */
export const UpgradeOpportunityRowSchema = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.optional(NullableString),
  overallScore: Schema.Number,
  upgradeProbability: Schema.Number,
  lifecycleStage: Schema.String,
  tier: Schema.optional(NullableString),
});
