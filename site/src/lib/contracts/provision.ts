// Boundary parser internals decode untrusted JSON into branded provision types.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';
import { CustomerId, EmailAddress } from './admin-session';

export { CustomerId, EmailAddress };

/** A failure decoding a provision wire payload. */
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

/** Payload returned by the Worker provision endpoint. */
export const ProvisionResponseSchema = Schema.Struct({
  success: Schema.Literal(true),
  customerId: CustomerId,
  licenseKey: LicenseKey,
  message: Schema.optional(Schema.String),
});
export type ProvisionResponse = Schema.Schema.Type<typeof ProvisionResponseSchema>;

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
    Effect.mapError(
      cause => new ProvisionParseError('Provision response has an invalid shape', cause)
    )
  );
}
