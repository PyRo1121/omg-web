import * as Schema from 'effect/Schema';

/** Private identifier accepted from Better Auth or internal callers. */
export const PrivateReference = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256));

/** Human-readable label bounded against oversized D1 values. */
export const DisplayText = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256));

/** Normalized email accepted at Worker ingestion boundaries. */
export const NormalizedEmail = Schema.String.pipe(
  Schema.minLength(3),
  Schema.maxLength(320),
  Schema.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u),
  Schema.filter(value => value === value.trim() && value === value.toLowerCase())
);

/** Better Auth organization membership roles. */
export const Role = Schema.Literal('owner', 'admin', 'member');

/** Billing tiers, or null when no license row exists. */
export const Tier = Schema.NullOr(Schema.Literal('free', 'pro', 'team', 'enterprise'));

/** Bounded optional field policy shared by ingestion contracts. */
export const OptionalCount = Schema.optional(
  Schema.Number.pipe(Schema.int(), Schema.between(0, 1_000_000_000))
);

/** Duration ceiling shared by telemetry and usage ingestion (31 days). */
export const OptionalDurationMs = Schema.optional(
  Schema.Number.pipe(Schema.int(), Schema.between(0, 31 * 24 * 60 * 60 * 1000))
);

/** JSON leaf value for free-form event properties. */
export const JsonAtom = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);
