// Boundary parser internals decode untrusted license-validation JSON and D1 rows.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON/D1 boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';
import { LicenseKey } from './license-key';

export { LicenseKey };

/** A failure decoding a validate-license payload or D1 row. */
export class ValidateLicenseParseError extends Error {
  readonly _tag = 'ValidateLicenseParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const NullableString = Schema.Union(Schema.Null, Schema.String);

/** D1 aggregate that may be SQL NULL. */
const D1Number = Schema.Union(Schema.Number, Schema.Null).pipe(
  Schema.transform(Schema.Number, {
    decode: (fromA: number | null) => (fromA === null ? 0 : fromA),
    encode: (toI: number) => toI,
  })
);

/** Untrusted GET query or POST JSON fields for license validation. */
export const ValidateLicenseFieldsSchema = Schema.Struct({
  key: Schema.optional(NullableString),
  license_key: Schema.optional(NullableString),
  machine_id: Schema.optional(NullableString),
  user_name: Schema.optional(NullableString),
  user_email: Schema.optional(NullableString),
});
export type ValidateLicenseFields = Schema.Schema.Type<typeof ValidateLicenseFieldsSchema>;

/** Normalized CLI activation request. */
export interface ValidateLicenseRequest {
  readonly licenseKey: LicenseKey;
  readonly machineId: string | null;
  readonly userName: string | null;
  readonly userEmail: string | null;
}

/** License + customer columns required to validate and mint a JWT. */
export const ValidateLicenseRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  customer_id: Schema.String.pipe(Schema.minLength(1)),
  license_key: LicenseKey,
  tier: Schema.String,
  status: Schema.String,
  max_seats: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  max_machines: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  expires_at: NullableString,
  email: Schema.String,
  customer_name: NullableString,
});
export type ValidateLicenseRow = Schema.Schema.Type<typeof ValidateLicenseRowSchema>;

/** Existing machine lookup row. */
export const ExistingMachineRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
});

/** Active machine count for seat enforcement. */
export const MachineCountRowSchema = Schema.Struct({
  count: D1Number,
});

/** Machine row returned to the CLI for dashboard sync. */
export const ActiveMachineRowSchema = Schema.Struct({
  machine_id: Schema.String,
  hostname: NullableString,
  os: NullableString,
  arch: NullableString,
  omg_version: NullableString,
  is_active: D1Number,
  first_seen_at: NullableString,
  last_seen_at: NullableString,
  user_name: NullableString,
  user_email: NullableString,
});
export type ActiveMachineRow = Schema.Schema.Type<typeof ActiveMachineRowSchema>;

/** Daily usage row returned to the CLI for dashboard sync. */
export const LicenseUsageRowSchema = Schema.Struct({
  date: Schema.String,
  commands_run: D1Number,
  packages_installed: D1Number,
  packages_searched: D1Number,
  runtimes_switched: D1Number,
  sbom_generated: D1Number,
  vulnerabilities_found: D1Number,
  time_saved_ms: D1Number,
});
export type LicenseUsageRow = Schema.Schema.Type<typeof LicenseUsageRowSchema>;

function mapParseError(reason: string) {
  return (cause: unknown): ValidateLicenseParseError =>
    new ValidateLicenseParseError(reason, cause);
}

function nonempty(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.length === 0) {
    return null;
  }
  return value;
}

/**
 * Decode untrusted validate-license fields.
 *
 * @param value - Raw JSON or query-derived object.
 * @returns The typed fields, or `ValidateLicenseParseError`.
 */
export function decodeValidateLicenseFields(
  value: unknown
): Effect.Effect<ValidateLicenseFields, ValidateLicenseParseError> {
  return Schema.decodeUnknown(ValidateLicenseFieldsSchema)(value).pipe(
    Effect.mapError(mapParseError('Validate-license request has an invalid shape'))
  );
}

/**
 * Pick `key` over `license_key` and drop empty optional identifiers.
 *
 * @param fields - Decoded wire fields.
 * @returns The normalized request, or `null` when no license key is present.
 */
export function toValidateLicenseRequest(
  fields: ValidateLicenseFields
): ValidateLicenseRequest | null {
  const rawKey = nonempty(fields.key) ?? nonempty(fields.license_key);
  if (rawKey === null) {
    return null;
  }
  const decoded = Schema.decodeUnknownEither(LicenseKey)(rawKey);
  if (decoded._tag === 'Left') {
    return null;
  }
  return {
    licenseKey: decoded.right,
    machineId: nonempty(fields.machine_id),
    userName: fields.user_name === undefined ? null : fields.user_name,
    userEmail: fields.user_email === undefined ? null : fields.user_email,
  };
}

/**
 * Decode a D1 row against a schema.
 *
 * @param schema - Row schema.
 * @param reason - Parse error reason.
 * @param value - The D1 result.
 * @returns The typed row, or `ValidateLicenseParseError`.
 */
export function decodeRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<Schema.Schema.Type<S>, ValidateLicenseParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(Effect.mapError(mapParseError(reason)));
}

/**
 * Decode a D1 `.all().results` array against an item schema.
 *
 * @param schema - Item schema.
 * @param reason - Parse error reason.
 * @param value - The `results` array, which may be missing.
 * @returns Typed items, or `ValidateLicenseParseError`.
 */
export function decodeRowArray<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, ValidateLicenseParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed([]);
  }
  if (!Array.isArray(value)) {
    return Effect.fail(new ValidateLicenseParseError(reason));
  }
  return Effect.forEach(value, row => decodeRow(schema, reason, row));
}
