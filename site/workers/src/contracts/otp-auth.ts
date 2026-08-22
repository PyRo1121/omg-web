// Boundary parser internals decode untrusted JSON and D1 rows into branded OTP auth types.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { CustomerId, EmailAddress, SessionToken } from './site-session';

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
    email: Schema.String,
    name: Schema.Union(Schema.Null, Schema.String),
  }),
});
export type VerifyCodeResponse = Schema.Schema.Type<typeof VerifyCodeResponseSchema>;

/** COUNT(*) row used for OTP rate limiting. */
export const AuthCodeCountRowSchema = Schema.Struct({
  count: Schema.Number,
});
export type AuthCodeCountRow = Schema.Schema.Type<typeof AuthCodeCountRowSchema>;

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

/**
 * Decode a D1 COUNT(*) row used for OTP rate limiting.
 *
 * @param value - The D1 `.first()` result.
 * @returns The typed count row, or `AuthParseError`.
 */
export function decodeAuthCodeCountRow(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<AuthCodeCountRow, AuthParseError> {
  return Schema.decodeUnknown(AuthCodeCountRowSchema)(value).pipe(
    Effect.mapError(mapParseError('Auth code count row has an invalid shape'))
  );
}

/**
 * Decode a D1 OTP row selected for verification.
 *
 * @param value - The D1 `.first()` result.
 * @returns The typed OTP row, or `AuthParseError`.
 */
export function decodeAuthCodeRow(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<AuthCodeRow, AuthParseError> {
  return Schema.decodeUnknown(AuthCodeRowSchema)(value).pipe(
    Effect.mapError(mapParseError('Auth code row has an invalid shape'))
  );
}

/**
 * Decode a D1 customer row used while creating a session.
 *
 * @param value - The D1 `.first()` result.
 * @returns The typed customer row, or `AuthParseError`.
 */
export function decodeAuthCustomerRow(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<AuthCustomerRow, AuthParseError> {
  return Schema.decodeUnknown(AuthCustomerRowSchema)(value).pipe(
    Effect.mapError(mapParseError('Customer row has an invalid shape'))
  );
}
