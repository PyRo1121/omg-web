// Boundary parser internals intentionally inspect unknown account dashboard payloads.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get -- Safe JSON boundary parsing requires these operations.

import { Schema } from '@effect/schema';

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
 * Decode an untrusted account dashboard payload at the network boundary.
 *
 * @param value - The raw JSON received from the account dashboard endpoint.
 * @returns The typed dashboard payload, or `null` when the payload does not match the schema.
 */
export function decodeDashboardData(value: unknown): DashboardData | null {
  const decoded = Schema.decodeUnknownEither(DashboardDataSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
