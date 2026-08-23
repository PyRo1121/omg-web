// Boundary parser internals intentionally inspect unknown account dashboard payloads.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';

/** A failure decoding or encoding an account dashboard payload. */
export class DashboardDataParseError extends Error {
  readonly _tag = 'DashboardDataParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const DashboardDataSchema = Schema.Struct({
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

export type DashboardData = Schema.Schema.Type<typeof DashboardDataSchema>;

/** Parse an account dashboard payload at the network boundary. */
export function parseAccountDashboard(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<DashboardData, DashboardDataParseError> {
  return Schema.decodeUnknown(DashboardDataSchema)(value).pipe(
    Effect.mapError(
      cause => new DashboardDataParseError('Dashboard response has an invalid shape', cause)
    )
  );
}

/** Decode an untrusted account dashboard payload, returning `null` when invalid. */
export function decodeDashboardData(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): DashboardData | null {
  const decoded = Schema.decodeUnknownEither(DashboardDataSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
