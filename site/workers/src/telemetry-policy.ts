import { Schema } from '@effect/schema';
import { Effect } from 'effect';

const TelemetryPolicyRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  customer_id: Schema.String.pipe(Schema.minLength(1)),
  telemetry_opt_out: Schema.Union(Schema.Number, Schema.Boolean, Schema.Null),
});

/** D1 failed while resolving a license's telemetry policy. */
export class TelemetryPolicyStoreUnavailable extends Error {
  readonly _tag = 'TelemetryPolicyStoreUnavailable';

  constructor(readonly cause: unknown) {
    super('Telemetry policy store is unavailable');
  }
}

/** A persisted telemetry policy row violated its schema. */
export class InvalidTelemetryPolicyRow extends Error {
  readonly _tag = 'InvalidTelemetryPolicyRow';

  constructor(readonly cause: unknown) {
    super('Telemetry policy row has an invalid shape');
  }
}

/** The decision that controls whether an ingestion request may mutate telemetry state. */
export type TelemetryIngestionDecision =
  | {
      readonly _tag: 'allowed';
      readonly licenseId: string;
      readonly customerId: string;
    }
  | { readonly _tag: 'optedOut' }
  | { readonly _tag: 'invalidLicense' };

/**
 * Resolve the effective telemetry policy for an active license credential.
 *
 * @param db - The licensing D1 database.
 * @param licenseKey - The raw credential supplied at the HTTP boundary.
 * @returns The ingestion decision, or a typed persistence/schema failure.
 */
export function resolveTelemetryIngestion(
  db: D1Database,
  licenseKey: string
): Effect.Effect<
  TelemetryIngestionDecision,
  TelemetryPolicyStoreUnavailable | InvalidTelemetryPolicyRow
> {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `SELECT l.id, l.customer_id, c.telemetry_opt_out
           FROM licenses l
           JOIN customers c ON c.id = l.customer_id
           WHERE l.license_key = ? AND l.status = 'active'`
        )
        .bind(licenseKey)
        .first(),
    catch: cause => new TelemetryPolicyStoreUnavailable(cause),
  }).pipe(
    Effect.flatMap(row => {
      if (row === null) {
        return Effect.succeed<TelemetryIngestionDecision>({ _tag: 'invalidLicense' });
      }
      return Schema.decodeUnknown(TelemetryPolicyRowSchema)(row).pipe(
        Effect.mapError(cause => new InvalidTelemetryPolicyRow(cause)),
        Effect.map(
          (policy): TelemetryIngestionDecision =>
            policy.telemetry_opt_out === true || policy.telemetry_opt_out === 1
              ? { _tag: 'optedOut' }
              : {
                  _tag: 'allowed',
                  licenseId: policy.id,
                  customerId: policy.customer_id,
                }
        )
      );
    })
  );
}
