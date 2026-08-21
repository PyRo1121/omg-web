// Boundary parser internals decode untrusted JSON into branded site-session types.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';

/** A failure decoding a site-session wire payload. */
export class SiteSessionParseError extends Error {
  readonly _tag = 'SiteSessionParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A normalized email address used as the site-session lookup key. */
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

/** An opaque Worker session token that never crosses the BFF/browser boundary. */
export const SessionToken = Schema.String.pipe(Schema.minLength(1), Schema.brand('SessionToken'));
export type SessionToken = Schema.Schema.Type<typeof SessionToken>;

/** A customer identifier in the licensing database. */
export const CustomerId = Schema.String.pipe(Schema.minLength(1), Schema.brand('CustomerId'));
export type CustomerId = Schema.Schema.Type<typeof CustomerId>;

/** Better Auth role projected into the licensing Worker session. */
export const SiteSessionRole = Schema.Literal('admin', 'user');
export type SiteSessionRole = Schema.Schema.Type<typeof SiteSessionRole>;

/** Body posted by the trusted site BFF to mint a Worker session. */
export const SiteSessionRequestSchema = Schema.Struct({
  email: EmailAddress,
  name: Schema.optional(Schema.String),
  betterAuthUserId: Schema.optional(Schema.String),
  role: SiteSessionRole,
});
export type SiteSessionRequest = Schema.Schema.Type<typeof SiteSessionRequestSchema>;

/** Session payload returned only to the server-side BFF. */
export const SiteSessionWorkerResponseSchema = Schema.Struct({
  token: SessionToken,
  expiresAt: Schema.String.pipe(Schema.minLength(1)),
  customerId: CustomerId,
});
export type SiteSessionWorkerResponse = Schema.Schema.Type<typeof SiteSessionWorkerResponseSchema>;

function mapParseError(reason: string) {
  return (cause: unknown): SiteSessionParseError => new SiteSessionParseError(reason, cause);
}

/** Decode an untrusted internal site-session request body. */
export function decodeSiteSessionRequest(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<SiteSessionRequest, SiteSessionParseError> {
  return Schema.decodeUnknown(SiteSessionRequestSchema)(value).pipe(
    Effect.mapError(mapParseError('Site session request has an invalid shape'))
  );
}

/** Decode the untrusted Worker response consumed only by the server-side BFF. */
export function decodeSiteSessionWorkerResponse(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<SiteSessionWorkerResponse, SiteSessionParseError> {
  return Schema.decodeUnknown(SiteSessionWorkerResponseSchema)(value).pipe(
    Effect.mapError(mapParseError('Worker session response has an invalid shape'))
  );
}
