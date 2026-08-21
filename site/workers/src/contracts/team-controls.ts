// Boundary parser internals decode team-control JSON and D1 rows.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';

/** A failure decoding a team-controls payload or stored JSON field. */
export class TeamControlsParseError extends Error {
  readonly _tag = 'TeamControlsParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const OptionalBoolean = Schema.optional(Schema.Boolean);
const OptionalNumber = Schema.optional(Schema.Number);
const OptionalString = Schema.optional(Schema.String);
const JsonAtom = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);

/** Body posted to create an enterprise policy. */
export const CreatePolicyBodySchema = Schema.Struct({
  scope: Schema.String,
  rule: Schema.String,
  value: Schema.String,
  enforced: OptionalBoolean,
});
export type CreatePolicyBody = Schema.Schema.Type<typeof CreatePolicyBodySchema>;

/** Body posted to update an enterprise policy. */
export const UpdatePolicyBodySchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  value: OptionalString,
  enforced: OptionalBoolean,
});
export type UpdatePolicyBody = Schema.Schema.Type<typeof UpdatePolicyBodySchema>;

/** Body posted to delete an enterprise policy. */
export const DeletePolicyBodySchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
});
export type DeletePolicyBody = Schema.Schema.Type<typeof DeletePolicyBodySchema>;

/** One notification channel setting. */
export const NotificationSettingSchema = Schema.Struct({
  type: Schema.String.pipe(Schema.minLength(1)),
  enabled: Schema.Boolean,
  threshold: OptionalNumber,
  channels: Schema.Array(Schema.String),
});
export type NotificationSetting = Schema.Schema.Type<typeof NotificationSettingSchema>;

/** Body posted to replace notification settings. */
export const UpdateNotificationSettingsBodySchema = Schema.Struct({
  settings: Schema.Array(NotificationSettingSchema),
});
export type UpdateNotificationSettingsBody = Schema.Schema.Type<
  typeof UpdateNotificationSettingsBodySchema
>;

/** Body posted to revoke a team machine. */
export const RevokeMemberBodySchema = Schema.Struct({
  machine_id: Schema.String.pipe(Schema.minLength(1)),
});
export type RevokeMemberBody = Schema.Schema.Type<typeof RevokeMemberBodySchema>;

/** Body posted to set an alert threshold. */
export const AlertThresholdBodySchema = Schema.Struct({
  threshold_type: Schema.String.pipe(Schema.minLength(1)),
  value: Schema.Number,
});
export type AlertThresholdBody = Schema.Schema.Type<typeof AlertThresholdBodySchema>;

/** Persisted notification_settings row. */
export const NotificationSettingRowSchema = Schema.Struct({
  type: Schema.String,
  enabled: Schema.Union(Schema.Number, Schema.Boolean),
  threshold: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  channels: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
});
export type NotificationSettingRow = Schema.Schema.Type<typeof NotificationSettingRowSchema>;

/** Audit log row returned to the team dashboard. */
export const AuditLogRowSchema = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  resource_type: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  resource_id: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  ip_address: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  user_agent: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  metadata: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  created_at: Schema.String,
});
export type AuditLogRow = Schema.Schema.Type<typeof AuditLogRowSchema>;

const StoredStringArraySchema = Schema.Array(Schema.String);
const StoredJsonObjectSchema = Schema.Record({ key: Schema.String, value: JsonAtom });

/**
 * Decode a stored JSON array of strings.
 *
 * Missing or empty values use `fallback`. Corrupt JSON fails.
 *
 * @param value - Persisted JSON text.
 * @param fallback - Value used when the field is empty.
 * @returns Typed channels, the fallback, or `TeamControlsParseError`.
 */
export function decodeStoredStringArray(
  value: string | null | undefined,
  fallback: ReadonlyArray<string>
): Effect.Effect<ReadonlyArray<string>, TeamControlsParseError> {
  if (value === null || value === undefined || value.length === 0) {
    return Effect.succeed(fallback);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause: unknown) {
    return Effect.fail(
      new TeamControlsParseError('Stored channels JSON has an invalid shape', cause)
    );
  }
  return Schema.decodeUnknown(StoredStringArraySchema)(parsed).pipe(
    Effect.mapError(
      (cause: unknown): TeamControlsParseError =>
        new TeamControlsParseError('Stored channels JSON has an invalid shape', cause)
    )
  );
}

/**
 * Decode stored JSON object metadata.
 *
 * Missing or empty values become null. Corrupt JSON fails.
 *
 * @param value - Persisted JSON text.
 * @returns A primitive record, null, or `TeamControlsParseError`.
 */
export function decodeStoredJsonObject(
  value: string | null | undefined
): Effect.Effect<
  Readonly<Record<string, string | number | boolean | null>> | null,
  TeamControlsParseError
> {
  if (value === null || value === undefined || value.length === 0) {
    return Effect.succeed(null);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause: unknown) {
    return Effect.fail(
      new TeamControlsParseError('Stored metadata JSON has an invalid shape', cause)
    );
  }
  return Schema.decodeUnknown(StoredJsonObjectSchema)(parsed).pipe(
    Effect.mapError(
      (cause: unknown): TeamControlsParseError =>
        new TeamControlsParseError('Stored metadata JSON has an invalid shape', cause)
    )
  );
}

/**
 * Decode a D1 row against a team-controls schema.
 *
 * @param schema - Row schema.
 * @param reason - Parse error reason.
 * @param value - The D1 result.
 * @returns The typed row, or `TeamControlsParseError`.
 */
export function decodeTeamControlsRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<Schema.Schema.Type<S>, TeamControlsParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      (cause: unknown): TeamControlsParseError => new TeamControlsParseError(reason, cause)
    )
  );
}

/**
 * Decode a D1 `.all().results` array against a team-controls item schema.
 *
 * @param schema - Item schema.
 * @param reason - Parse error reason.
 * @param value - The `results` array.
 * @returns Typed items, or `TeamControlsParseError`.
 */
export function decodeTeamControlsRowArray<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, TeamControlsParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed([]);
  }
  if (!Array.isArray(value)) {
    return Effect.fail(new TeamControlsParseError(reason));
  }
  return Effect.forEach(value, row => decodeTeamControlsRow(schema, reason, row));
}
