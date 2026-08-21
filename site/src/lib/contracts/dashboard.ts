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

/** A user session record returned by the account dashboard endpoint. */
export const DashboardSessionSchema = Schema.Struct({
  id: Schema.String,
  ipAddress: Schema.Union(Schema.Null, Schema.String),
  userAgent: Schema.Union(Schema.Null, Schema.String),
  createdAt: Schema.String,
  expiresAt: Schema.String,
  isCurrent: Schema.Boolean,
});

/** A social / OAuth account record returned by the account dashboard endpoint. */
export const DashboardAccountSchema = Schema.Struct({
  provider: Schema.String,
  accountId: Schema.String,
});

/** The user profile block returned by the account dashboard endpoint. */
export const DashboardUserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  image: Schema.Union(Schema.Null, Schema.String),
  createdAt: Schema.String,
});

/** The full payload returned by the authenticated account dashboard endpoint. */
export const DashboardDataSchema = Schema.Struct({
  user: DashboardUserSchema,
  sessions: Schema.Array(DashboardSessionSchema),
  accounts: Schema.Array(DashboardAccountSchema),
});

export type DashboardData = Schema.Schema.Type<typeof DashboardDataSchema>;

/**
 * Parse an account dashboard payload at the network boundary.
 *
 * Used both to decode untrusted JSON from the client and to refuse emitting an
 * outbound payload that does not match the Schema.
 *
 * @param value - Untrusted JSON or a constructed server payload.
 * @returns The typed dashboard payload, or `DashboardDataParseError`.
 */
export function parseAccountDashboard(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<DashboardData, DashboardDataParseError> {
  return Schema.decodeUnknown(DashboardDataSchema)(value).pipe(
    Effect.mapError(
      cause => new DashboardDataParseError('Dashboard response has an invalid shape', cause)
    )
  );
}

/**
 * Decode an untrusted account dashboard payload at the network boundary.
 *
 * @param value - The raw JSON received from the account dashboard endpoint.
 * @returns The typed dashboard payload, or `null` when the payload does not match the schema.
 */
export function decodeDashboardData(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): DashboardData | null {
  const decoded = Schema.decodeUnknownEither(DashboardDataSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
