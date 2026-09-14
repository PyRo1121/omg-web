import * as Schema from 'effect/Schema';

/**
 * Link credential for `omg account link <token>`.
 *
 * The CLI posts this pasted token to `/api/validate-license`, which resolves it
 * to the customer's license and returns a signed short-lived JWT for offline
 * verification. Usage reported through `/api/report-usage` anchors to the same
 * license, so the dashboard can attribute activity back to the account.
 */
export const DashboardLinkResponseSchema = Schema.Struct({
  /** Pasting credential, CLI-format safe: ASCII alphanumeric or "-", at most 128 characters. */
  license_key: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  tier: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  expires_at: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
  machine_count: Schema.NonNegativeInt,
});

export type DashboardLinkResponse = Schema.Schema.Type<typeof DashboardLinkResponseSchema>;
