// Boundary parser internals decode untrusted JSON and D1 rows into branded OTP auth types.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { CustomerId, EmailAddress, SessionToken } from '../../../shared/site-session';

export { CustomerId, EmailAddress, SessionToken };

/** A failure decoding an OTP auth payload or D1 row. */
export class AuthParseError extends Error {
  readonly _tag = 'AuthParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** A one-time verification code. */
export const OtpCode = Schema.String.pipe(Schema.pattern(/^\d{6}$/u), Schema.brand('OtpCode'));
export type OtpCode = Schema.Schema.Type<typeof OtpCode>;

/** Body posted to send an OTP. */
export const SendCodeRequestSchema = Schema.Struct({
  email: EmailAddress,
  turnstileToken: Schema.optional(Schema.String),
});

/** Body posted to verify an OTP. */
export const VerifyCodeRequestSchema = Schema.Struct({
  email: EmailAddress,
  code: OtpCode,
});

/** Body posted with a session token. */
export const SessionTokenRequestSchema = Schema.Struct({
  token: SessionToken,
});

/** Payload returned after sending an OTP. */
export const SendCodeResponseSchema = Schema.Struct({
  success: Schema.Literal(true),
  message: Schema.String,
});
export type SendCodeResponse = Schema.Schema.Type<typeof SendCodeResponseSchema>;

/** Payload returned after verifying an OTP. */
export const VerifyCodeResponseSchema = Schema.Struct({
  success: Schema.Literal(true),
  token: SessionToken,
  expires_at: Schema.String.pipe(Schema.minLength(1)),
  user: Schema.Struct({
    id: CustomerId,
    // Display-only echo of the stored customer email; it is not accepted back
    // as input, so the branded request-side EmailAddress is intentionally not
    // reused here (branding would also re-validate every legacy stored email).
    email: Schema.String,
    name: Schema.Union(Schema.Null, Schema.String),
  }),
});
export type VerifyCodeResponse = Schema.Schema.Type<typeof VerifyCodeResponseSchema>;

/** COUNT(*) row used for OTP rate limiting. */
export const AuthCodeCountRowSchema = Schema.Struct({
  count: Schema.Number,
});

/** A valid unused OTP row. */
export const AuthCodeRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
});
export type AuthCodeRow = Schema.Schema.Type<typeof AuthCodeRowSchema>;

/** A customer row used while creating a session. */
export const AuthCustomerRowSchema = Schema.Struct({
  id: CustomerId,
  email: Schema.String,
  company: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
});
export type AuthCustomerRow = Schema.Schema.Type<typeof AuthCustomerRowSchema>;

function mapParseError(reason: string) {
  return (cause: unknown): AuthParseError => new AuthParseError(reason, cause);
}

/** Decode one D1 row against its schema into a typed value, or fail with `AuthParseError`. */
function decodeRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string
): (
  value: Schema.Schema.Encoded<Schema.Schema.Any>
) => Effect.Effect<Schema.Schema.Type<S>, AuthParseError> {
  const decode = Schema.decodeUnknown(schema);
  return value => Effect.mapError(decode(value), mapParseError(reason));
}

/**
 * Decode a D1 COUNT(*) row used for OTP rate limiting.
 *
 * @param value - The D1 `.first()` result.
 * @returns The typed count row, or `AuthParseError`.
 */
export const decodeAuthCodeCountRow = decodeRow(
  AuthCodeCountRowSchema,
  'Auth code count row has an invalid shape'
);

/**
 * Decode a D1 OTP row selected for verification.
 *
 * @param value - The D1 `.first()` result.
 * @returns The typed OTP row, or `AuthParseError`.
 */
export const decodeAuthCodeRow = decodeRow(AuthCodeRowSchema, 'Auth code row has an invalid shape');

/**
 * Decode a D1 customer row used while creating a session.
 *
 * @param value - The D1 `.first()` result.
 * @returns The typed customer row, or `AuthParseError`.
 */
export const decodeAuthCustomerRow = decodeRow(
  AuthCustomerRowSchema,
  'Customer row has an invalid shape'
);
