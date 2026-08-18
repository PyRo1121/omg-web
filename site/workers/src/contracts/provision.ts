// Boundary parser internals decode untrusted JSON and D1 rows into branded provision types.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';
import { CustomerId, EmailAddress } from './admin-session';

export { CustomerId, EmailAddress };

/** A failure decoding a provision wire payload or D1 row. */
export class ProvisionParseError extends Error {
  readonly _tag = 'ProvisionParseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** An opaque license key issued at provision time. */
export const LicenseKey = Schema.String.pipe(Schema.minLength(1), Schema.brand('LicenseKey'));
export type LicenseKey = Schema.Schema.Type<typeof LicenseKey>;

/** Body posted to mint a customer and license. */
export const ProvisionRequestSchema = Schema.Struct({
  email: EmailAddress,
  name: Schema.optional(Schema.String),
});
export type ProvisionRequest = Schema.Schema.Type<typeof ProvisionRequestSchema>;

/** Payload returned by POST /api/provision-user. */
export const ProvisionResponseSchema = Schema.Struct({
  success: Schema.Literal(true),
  customerId: CustomerId,
  licenseKey: LicenseKey,
  message: Schema.optional(Schema.String),
});
export type ProvisionResponse = Schema.Schema.Type<typeof ProvisionResponseSchema>;

/** A customer row selected during provision. */
export const ProvisionCustomerRowSchema = Schema.Struct({
  id: CustomerId,
  email: Schema.String,
});
export type ProvisionCustomerRow = Schema.Schema.Type<typeof ProvisionCustomerRowSchema>;

/** An active license row reused during provision. */
export const ProvisionLicenseRowSchema = Schema.Struct({
  license_key: LicenseKey,
});
export type ProvisionLicenseRow = Schema.Schema.Type<typeof ProvisionLicenseRowSchema>;

function mapParseError(reason: string) {
  return (cause: unknown): ProvisionParseError => new ProvisionParseError(reason, cause);
}

/**
 * Decode an untrusted provision request body.
 *
 * @param value - Raw JSON posted to the Worker.
 * @returns The typed request, or `ProvisionParseError`.
 */
export function decodeProvisionRequest(
  value: unknown
): Effect.Effect<ProvisionRequest, ProvisionParseError> {
  return Schema.decodeUnknown(ProvisionRequestSchema)(value).pipe(
    Effect.mapError(mapParseError('Provision request has an invalid shape'))
  );
}

/**
 * Decode an untrusted provision response.
 *
 * @param value - Raw JSON from the Worker.
 * @returns The typed response, or `ProvisionParseError`.
 */
export function decodeProvisionResponse(
  value: unknown
): Effect.Effect<ProvisionResponse, ProvisionParseError> {
  return Schema.decodeUnknown(ProvisionResponseSchema)(value).pipe(
    Effect.mapError(mapParseError('Provision response has an invalid shape'))
  );
}

/**
 * Decode a D1 customer row selected during provision.
 *
 * @param value - The D1 `.first()` result.
 * @returns The typed customer row, or `ProvisionParseError`.
 */
export function decodeProvisionCustomerRow(
  value: unknown
): Effect.Effect<ProvisionCustomerRow, ProvisionParseError> {
  return Schema.decodeUnknown(ProvisionCustomerRowSchema)(value).pipe(
    Effect.mapError(mapParseError('Customer row has an invalid shape'))
  );
}

/**
 * Decode a D1 license row reused during provision.
 *
 * @param value - The D1 `.first()` result.
 * @returns The typed license row, or `ProvisionParseError`.
 */
export function decodeProvisionLicenseRow(
  value: unknown
): Effect.Effect<ProvisionLicenseRow, ProvisionParseError> {
  return Schema.decodeUnknown(ProvisionLicenseRowSchema)(value).pipe(
    Effect.mapError(mapParseError('License row has an invalid shape'))
  );
}
