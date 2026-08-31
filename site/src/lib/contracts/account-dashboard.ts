import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { NullableStringSchema } from '../../../../shared/d1-rows';

export interface DashboardData {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly image: string | null;
    readonly createdAt: string;
  };
  readonly sessions: ReadonlyArray<{
    readonly id: string;
    readonly ipAddress: string | null;
    readonly userAgent: string | null;
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly isCurrent: boolean;
  }>;
  readonly accounts: ReadonlyArray<{
    readonly provider: string;
    readonly accountId: string;
  }>;
}

export class DashboardDataParseError extends Error {
  readonly _tag = 'DashboardDataParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const D1TimestampSchema = Schema.Union(
  Schema.instanceOf(Date),
  Schema.Number.pipe(
    Schema.transform(Schema.instanceOf(Date), {
      decode: value => new Date(value),
      encode: value => value.getTime(),
    })
  ),
  Schema.String.pipe(
    Schema.transform(Schema.instanceOf(Date), {
      decode: value => new Date(value),
      encode: value => value.toISOString(),
    })
  )
).pipe(Schema.filter(value => Number.isFinite(value.getTime())));

export const AccountDashboardSessionRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  token: Schema.String,
  ipAddress: Schema.optional(NullableStringSchema),
  userAgent: Schema.optional(NullableStringSchema),
  createdAt: D1TimestampSchema,
  expiresAt: D1TimestampSchema,
});

export const AccountDashboardAccountRowSchema = Schema.Struct({
  providerId: Schema.String,
  accountId: Schema.String,
});

const DashboardDataSchema: Schema.Schema<DashboardData> = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    emailVerified: Schema.Boolean,
    image: Schema.Union(Schema.Null, Schema.String),
    createdAt: Schema.String,
  }),
  sessions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      ipAddress: Schema.Union(Schema.Null, Schema.String),
      userAgent: Schema.Union(Schema.Null, Schema.String),
      createdAt: Schema.String,
      expiresAt: Schema.String,
      isCurrent: Schema.Boolean,
    })
  ),
  accounts: Schema.Array(
    Schema.Struct({
      provider: Schema.String,
      accountId: Schema.String,
    })
  ),
});

export function parseAccountDashboard(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<DashboardData, DashboardDataParseError> {
  return Schema.decodeUnknown(DashboardDataSchema)(value).pipe(
    Effect.mapError(
      cause => new DashboardDataParseError('Dashboard response has an invalid shape', cause)
    )
  );
}

export function decodeDashboardData(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): DashboardData | null {
  const decoded = Schema.decodeUnknownEither(DashboardDataSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
