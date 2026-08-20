// Boundary parser internals decode untrusted Worker OTP JSON into branded types.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';
import { CustomerId, EmailAddress, SessionToken } from './admin-session';

export { CustomerId, EmailAddress, SessionToken };

/** A failure decoding a Worker OTP wire payload. */
export class AuthParseError extends Error {
  readonly _tag = 'AuthParseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
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
export type SendCodeRequest = Schema.Schema.Type<typeof SendCodeRequestSchema>;

/** Body posted to verify an OTP. */
export const VerifyCodeRequestSchema = Schema.Struct({
  email: EmailAddress,
  code: OtpCode,
});
export type VerifyCodeRequest = Schema.Schema.Type<typeof VerifyCodeRequestSchema>;

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

function mapParseError(reason: string) {
  return (cause: unknown): AuthParseError => new AuthParseError(reason, cause);
}

/**
 * Decode an untrusted send-code request before it is posted.
 *
 * @param value - Candidate JSON body.
 * @returns The typed request, or `AuthParseError`.
 */
export function decodeSendCodeRequest(
  value: unknown
): Effect.Effect<SendCodeRequest, AuthParseError> {
  return Schema.decodeUnknown(SendCodeRequestSchema)(value).pipe(
    Effect.mapError(mapParseError('Send-code request has an invalid shape'))
  );
}

/**
 * Decode an untrusted verify-code request before it is posted.
 *
 * @param value - Candidate JSON body.
 * @returns The typed request, or `AuthParseError`.
 */
export function decodeVerifyCodeRequest(
  value: unknown
): Effect.Effect<VerifyCodeRequest, AuthParseError> {
  return Schema.decodeUnknown(VerifyCodeRequestSchema)(value).pipe(
    Effect.mapError(mapParseError('Verify-code request has an invalid shape'))
  );
}

/**
 * Decode an untrusted send-code response.
 *
 * @param value - Raw JSON from the Worker.
 * @returns The typed response, or `AuthParseError`.
 */
export function decodeSendCodeResponse(
  value: unknown
): Effect.Effect<SendCodeResponse, AuthParseError> {
  return Schema.decodeUnknown(SendCodeResponseSchema)(value).pipe(
    Effect.mapError(mapParseError('Send-code response has an invalid shape'))
  );
}

/**
 * Decode an untrusted verify-code response.
 *
 * @param value - Raw JSON from the Worker.
 * @returns The typed session payload, or `AuthParseError`.
 */
export function decodeVerifyCodeResponse(
  value: unknown
): Effect.Effect<VerifyCodeResponse, AuthParseError> {
  return Schema.decodeUnknown(VerifyCodeResponseSchema)(value).pipe(
    Effect.mapError(mapParseError('Verify-code response has an invalid shape'))
  );
}
