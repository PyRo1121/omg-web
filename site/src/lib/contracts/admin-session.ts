// Boundary parser internals decode untrusted JSON into branded admin-session types.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';

/** A failure decoding an admin-session wire payload. */
export class AdminSessionParseError extends Error {
  readonly _tag = 'AdminSessionParseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A normalized email address used as the admin-session lookup key. */
export const EmailAddress = Schema.String.pipe(
  Schema.transform(
    Schema.String.pipe(Schema.pattern(EMAIL_PATTERN), Schema.brand('EmailAddress')),
    {
      decode: (fromA: string) => fromA.trim().toLowerCase(),
      encode: (toI: string) => toI,
    }
  )
);
export type EmailAddress = Schema.Schema.Type<typeof EmailAddress>;

/** An opaque Worker session token. */
export const SessionToken = Schema.String.pipe(Schema.minLength(1), Schema.brand('SessionToken'));
export type SessionToken = Schema.Schema.Type<typeof SessionToken>;

/** A customer identifier in the licensing database. */
export const CustomerId = Schema.String.pipe(Schema.minLength(1), Schema.brand('CustomerId'));
export type CustomerId = Schema.Schema.Type<typeof CustomerId>;

/** Body posted by the site to mint a Worker admin session. */
export const AdminSessionRequestSchema = Schema.Struct({
  email: EmailAddress,
  name: Schema.optional(Schema.String),
  betterAuthUserId: Schema.optional(Schema.String),
});
export type AdminSessionRequest = Schema.Schema.Type<typeof AdminSessionRequestSchema>;

/** Session payload returned by the Worker create-session endpoint. */
export const AdminSessionWorkerResponseSchema = Schema.Struct({
  token: SessionToken,
  expiresAt: Schema.String.pipe(Schema.minLength(1)),
  customerId: CustomerId,
});
export type AdminSessionWorkerResponse = Schema.Schema.Type<
  typeof AdminSessionWorkerResponseSchema
>;

/** Session payload returned by the SolidStart auth-bridge to the browser. */
export const AdminSessionClientResponseSchema = Schema.Struct({
  token: SessionToken,
  expiresAt: Schema.String.pipe(Schema.minLength(1)),
});
export type AdminSessionClientResponse = Schema.Schema.Type<
  typeof AdminSessionClientResponseSchema
>;

function mapParseError(reason: string) {
  return (cause: unknown): AdminSessionParseError => new AdminSessionParseError(reason, cause);
}

/**
 * Decode an untrusted Worker create-session response.
 *
 * @param value - Raw JSON from the Worker.
 * @returns The typed Worker session, or `AdminSessionParseError`.
 */
export function decodeAdminSessionWorkerResponse(
  value: unknown
): Effect.Effect<AdminSessionWorkerResponse, AdminSessionParseError> {
  return Schema.decodeUnknown(AdminSessionWorkerResponseSchema)(value).pipe(
    Effect.mapError(mapParseError('Worker session response has an invalid shape'))
  );
}

/**
 * Decode an untrusted auth-bridge response consumed by the dashboard view-model.
 *
 * @param value - Raw JSON from `/api/admin/auth-bridge`.
 * @returns The typed client session, or `AdminSessionParseError`.
 */
export function decodeAdminSessionClientResponse(
  value: unknown
): Effect.Effect<AdminSessionClientResponse, AdminSessionParseError> {
  return Schema.decodeUnknown(AdminSessionClientResponseSchema)(value).pipe(
    Effect.mapError(mapParseError('Authentication bridge returned an invalid session'))
  );
}

/**
 * Decode an untrusted create-session request body.
 *
 * @param value - Raw JSON posted to the Worker.
 * @returns The typed request, or `AdminSessionParseError`.
 */
export function decodeAdminSessionRequest(
  value: unknown
): Effect.Effect<AdminSessionRequest, AdminSessionParseError> {
  return Schema.decodeUnknown(AdminSessionRequestSchema)(value).pipe(
    Effect.mapError(mapParseError('Admin session request has an invalid shape'))
  );
}
