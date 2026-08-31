import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { D1Number } from '../../../../shared/d1-rows';

const PrivateReference = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256));
const DisplayText = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256));
const NormalizedEmail = Schema.String.pipe(
  Schema.minLength(3),
  Schema.maxLength(320),
  Schema.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u),
  Schema.filter(value => value === value.trim() && value === value.toLowerCase())
);
const NonNegativeInteger = Schema.NonNegativeInt;
const Role = Schema.Literal('owner', 'admin', 'member');
const Tier = Schema.NullOr(Schema.Literal('free', 'pro', 'team', 'enterprise'));
const NullableNumber = Schema.NullOr(Schema.Number);
const UsageTotals = Schema.Struct({
  commands: NonNegativeInteger,
  packagesInstalled: NonNegativeInteger,
  runtimeSwitches: NonNegativeInteger,
  timeSavedMs: NonNegativeInteger,
});

export const OrganizationUsageRequestSchema = Schema.Struct({
  organizationId: PrivateReference,
  userId: PrivateReference,
});

export const OrganizationUsageResponseSchema = Schema.Struct({
  organization: Schema.Struct({
    name: DisplayText,
    role: Role,
    status: Schema.Literal('active', 'restricted'),
    tier: Tier,
  }),
  seats: Schema.Struct({
    used: NonNegativeInteger,
    limit: Schema.NullOr(NonNegativeInteger.pipe(Schema.greaterThanOrEqualTo(1))),
  }),
  windowDays: Schema.Literal(30),
  members: Schema.Array(
    Schema.Struct({
      email: NormalizedEmail,
      name: DisplayText,
      role: Role,
      attributedMachines: NonNegativeInteger,
      usage: UsageTotals,
    })
  ),
  hasMoreMembers: Schema.Boolean,
  unattributed: Schema.Struct({
    machines: NonNegativeInteger,
    usage: UsageTotals,
  }),
  fleet: Schema.Struct({
    activeMachines: NonNegativeInteger,
    seenWithinSevenDays: NonNegativeInteger,
    notSeenWithinSevenDays: NonNegativeInteger,
    versions: Schema.Array(
      Schema.Struct({
        version: Schema.NullOr(DisplayText),
        machines: NonNegativeInteger,
      })
    ),
    hasMoreVersions: Schema.Boolean,
  }),
});

export const OrganizationUsageContextRowSchema = Schema.Struct({
  organizationId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  licenseId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  role: Role,
  tier: Tier,
  licenseStatus: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
  maxSeats: NullableNumber,
  usedSeats: D1Number,
});

export const OrganizationUsageMemberRowSchema = Schema.Struct({
  email: Schema.String,
  name: Schema.String,
  role: Role,
  attributedMachines: D1Number,
  commands: D1Number,
  packagesInstalled: D1Number,
  runtimeSwitches: D1Number,
  timeSavedMs: D1Number,
});

export const OrganizationUnattributedRowSchema = Schema.Struct({
  machines: D1Number,
  commands: D1Number,
  packagesInstalled: D1Number,
  runtimeSwitches: D1Number,
  timeSavedMs: D1Number,
});

export const OrganizationFleetRowSchema = Schema.Struct({
  activeMachines: D1Number,
  seenWithinSevenDays: D1Number,
  notSeenWithinSevenDays: D1Number,
});

export const OrganizationVersionRowSchema = Schema.Struct({
  version: Schema.NullOr(Schema.String.pipe(Schema.maxLength(256))),
  machines: D1Number,
});

export class OrganizationUsageParseError extends Error {
  readonly _tag = 'OrganizationUsageParseError';

  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

export function decodeOrganizationUsageRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<Schema.Schema.Type<S>, OrganizationUsageParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(cause => new OrganizationUsageParseError(reason, cause))
  );
}

export function decodeOrganizationUsageRows<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, OrganizationUsageParseError> {
  if (!Array.isArray(value)) {
    return Effect.fail(new OrganizationUsageParseError(reason));
  }
  return Effect.forEach(value, row => decodeOrganizationUsageRow(schema, reason, row));
}
