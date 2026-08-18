// Boundary parser internals decode remaining Worker HTTP JSON bodies.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON boundary parsing requires these operations.

import { Schema } from '@effect/schema';

const OptionalBoolean = Schema.optional(Schema.Boolean);
const OptionalNumber = Schema.optional(Schema.Number);
const OptionalString = Schema.optional(Schema.String);

const JsonValueSchema: Schema.Schema.AnyNoContext = Schema.suspend(() =>
  Schema.Union(
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(JsonValueSchema),
    Schema.Record({ key: Schema.String, value: JsonValueSchema })
  )
);
const JsonObject = Schema.Record({ key: Schema.String, value: JsonValueSchema });

/** Dashboard profile update. */
export const UpdateProfileBodySchema = Schema.Struct({
  name: OptionalString,
});
export type UpdateProfileBody = Schema.Schema.Type<typeof UpdateProfileBodySchema>;

/** Dashboard machine revoke. */
export const MachineIdBodySchema = Schema.Struct({
  machine_id: Schema.String.pipe(Schema.minLength(1)),
});
export type MachineIdBody = Schema.Schema.Type<typeof MachineIdBodySchema>;

/** Dashboard session revoke. */
export const SessionIdBodySchema = Schema.Struct({
  session_id: Schema.String.pipe(Schema.minLength(1)),
});
export type SessionIdBody = Schema.Schema.Type<typeof SessionIdBodySchema>;

/** Admin user update. */
export const AdminUpdateUserBodySchema = Schema.Struct({
  userId: Schema.String.pipe(Schema.minLength(1)),
  tier: OptionalString,
  status: OptionalString,
});
export type AdminUpdateUserBody = Schema.Schema.Type<typeof AdminUpdateUserBodySchema>;

/** Admin CRM note create. */
export const AdminCreateNoteBodySchema = Schema.Struct({
  customerId: Schema.String.pipe(Schema.minLength(1)),
  content: Schema.String.pipe(Schema.minLength(1)),
  noteType: OptionalString,
});
export type AdminCreateNoteBody = Schema.Schema.Type<typeof AdminCreateNoteBodySchema>;

/** Admin CRM note update. */
export const AdminUpdateNoteBodySchema = Schema.Struct({
  noteId: Schema.String.pipe(Schema.minLength(1)),
  content: OptionalString,
  isPinned: OptionalBoolean,
});
export type AdminUpdateNoteBody = Schema.Schema.Type<typeof AdminUpdateNoteBodySchema>;

/** Admin CRM tag create. */
export const AdminCreateTagBodySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  color: OptionalString,
  description: OptionalString,
});
export type AdminCreateTagBody = Schema.Schema.Type<typeof AdminCreateTagBodySchema>;

/** Admin CRM tag assignment. */
export const AdminAssignTagBodySchema = Schema.Struct({
  customerId: Schema.String.pipe(Schema.minLength(1)),
  tagId: Schema.String.pipe(Schema.minLength(1)),
});
export type AdminAssignTagBody = Schema.Schema.Type<typeof AdminAssignTagBodySchema>;

const TrackingEventSchema = Schema.Struct({
  event_type: Schema.String,
  event_name: Schema.String,
  properties: Schema.optional(JsonObject),
  timestamp: OptionalNumber,
  session_id: Schema.String,
  duration_ms: OptionalNumber,
});

/** Marketing-site analytics batch. */
export const TrackingBatchSchema = Schema.Struct({
  events: Schema.Array(TrackingEventSchema),
});
export type TrackingBatch = Schema.Schema.Type<typeof TrackingBatchSchema>;

const DocsAnalyticsEventSchema = Schema.Struct({
  event_type: Schema.String,
  event_name: Schema.String,
  properties: JsonObject,
  timestamp: Schema.String,
  session_id: Schema.String,
  duration_ms: OptionalNumber,
});

/** Docs-site analytics batch. */
export const DocsAnalyticsBatchSchema = Schema.Struct({
  events: Schema.Array(DocsAnalyticsEventSchema),
});
export type DocsAnalyticsBatch = Schema.Schema.Type<typeof DocsAnalyticsBatchSchema>;

const ErrorMessageSchema = Schema.Struct({
  message: Schema.String,
});

/**
 * Read a thrown value's message when it is an Error-shaped object.
 *
 * @param error - Caught value from SQLite or similar.
 * @returns The message, or an empty string.
 */
export function decodeThrownMessage(error: unknown): string {
  const decoded = Schema.decodeUnknownEither(ErrorMessageSchema)(error);
  return decoded._tag === 'Right' ? decoded.right.message : '';
}

/**
 * Read an optional string field from untrusted JSON properties.
 *
 * @param value - A property value.
 * @returns The string, or undefined.
 */
export function optionalStringField(value: unknown): string | undefined {
  const decoded = Schema.decodeUnknownEither(Schema.String)(value);
  return decoded._tag === 'Right' ? decoded.right : undefined;
}
