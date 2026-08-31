// Boundary parser internals decode remaining Worker HTTP JSON bodies.

import * as Schema from 'effect/Schema';
import {
  ADMIN_CUSTOMER_NOTE_TYPES,
  ADMIN_CUSTOMER_STATUSES,
} from '../../../../shared/admin-customers';

const OptionalBoolean = Schema.optional(Schema.Boolean);
const OptionalEpochMs = Schema.optional(
  Schema.Number.pipe(Schema.int(), Schema.between(0, 9_999_999_999_999))
);
const OptionalDurationMs = Schema.optional(
  Schema.Number.pipe(Schema.int(), Schema.between(0, 31 * 24 * 60 * 60 * 1000))
);

/** Non-empty caller-supplied identifier, capped against oversized D1 keys. */
const BoundedId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));

/** CRM note body accepted from the admin UI's note editor. */
const NoteContent = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(4000));

/** Note classifications offered by the admin notes UI (`NOTE_TYPES`). */
const NoteType = Schema.Literal(...ADMIN_CUSTOMER_NOTE_TYPES);

/** License tiers recognized by MRR pricing and badge rendering. */
const LicenseTier = Schema.Literal('free', 'pro', 'team', 'enterprise');

/** License statuses an admin may set (privacy deletion writes `deleted_by_user` directly). */
const AdminLicenseStatus = Schema.Literal(...ADMIN_CUSTOMER_STATUSES);

const MAX_ANALYTICS_PROPERTIES_BYTES = 4096;
const MAX_ANALYTICS_PROPERTY_ENTRIES = 32;
const JsonValueSchema: Schema.Schema.AnyNoContext = Schema.suspend(() =>
  Schema.Union(
    Schema.String.pipe(Schema.maxLength(512)),
    Schema.Number,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(JsonValueSchema).pipe(Schema.maxItems(MAX_ANALYTICS_PROPERTY_ENTRIES)),
    JsonObject
  )
);
const JsonObject: Schema.Schema.AnyNoContext = Schema.Record({
  key: Schema.String.pipe(Schema.maxLength(64)),
  value: JsonValueSchema,
}).pipe(
  Schema.filter(properties => Object.keys(properties).length <= MAX_ANALYTICS_PROPERTY_ENTRIES, {
    message: () => 'Analytics properties support at most 32 entries',
  }),
  Schema.filter(
    properties =>
      new TextEncoder().encode(JSON.stringify(properties)).byteLength <=
      MAX_ANALYTICS_PROPERTIES_BYTES,
    { message: () => 'Analytics properties exceed the maximum encoded size' }
  )
);

/** Dashboard company profile update. */
export const UpdateProfileBodySchema = Schema.Struct({
  company: Schema.optional(Schema.String.pipe(Schema.maxLength(120))),
});

/** Dashboard machine revoke. */
export const MachineIdBodySchema = Schema.Struct({
  machine_id: BoundedId,
});

/** Dashboard session revoke. */
export const SessionIdBodySchema = Schema.Struct({
  session_id: BoundedId,
});

/** Admin user update. */
export const AdminUpdateUserBodySchema = Schema.Struct({
  userId: BoundedId,
  tier: Schema.optional(LicenseTier),
  status: Schema.optional(AdminLicenseStatus),
});

/** Admin CRM note create. */
export const AdminCreateNoteBodySchema = Schema.Struct({
  customerId: BoundedId,
  content: NoteContent,
  noteType: Schema.optional(NoteType),
});

/** Admin CRM note update. */
export const AdminUpdateNoteBodySchema = Schema.Struct({
  noteId: BoundedId,
  content: Schema.optional(NoteContent),
  isPinned: OptionalBoolean,
});

/** Admin CRM tag create. */
export const AdminCreateTagBodySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  color: Schema.optional(Schema.String.pipe(Schema.pattern(/^#[0-9a-fA-F]{6}$/u))),
  description: Schema.optional(Schema.String.pipe(Schema.maxLength(256))),
});

/** Admin CRM tag assignment. */
export const AdminAssignTagBodySchema = Schema.Struct({
  customerId: BoundedId,
  tagId: BoundedId,
});

// Event types are the complete browser-client vocabulary. The handler maps
// these semantic names to the narrower legacy D1 storage categories.
const TrackingEventTypeSchema = Schema.Literal(
  'pageview',
  'scroll_depth',
  'time_on_page',
  'cta_click',
  'web_vitals',
  'engagement'
);

// String caps mirror the sibling DocsAnalyticsEventSchema below; the batch cap
// mirrors the handlers' MAX_EVENTS_PER_BATCH so oversized batches fail at decode.
const TrackingEventSchema = Schema.Struct({
  event_type: TrackingEventTypeSchema,
  event_name: Schema.String.pipe(Schema.maxLength(128)),
  properties: Schema.optional(JsonObject),
  timestamp: OptionalEpochMs,
  session_id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  duration_ms: OptionalDurationMs,
});

/** Marketing-site analytics batch. */
export const TrackingBatchSchema = Schema.Struct({
  events: Schema.Array(TrackingEventSchema).pipe(Schema.maxItems(50)),
});
export type TrackingBatch = Schema.Schema.Type<typeof TrackingBatchSchema>;

const DocsAnalyticsEventSchema = Schema.Struct({
  event_type: Schema.String.pipe(Schema.maxLength(64)),
  event_name: Schema.String.pipe(Schema.maxLength(128)),
  properties: JsonObject,
  timestamp: Schema.String.pipe(Schema.maxLength(40)),
  session_id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  duration_ms: OptionalDurationMs,
});

/** Docs-site analytics batch. */
export const DocsAnalyticsBatchSchema = Schema.Struct({
  events: Schema.Array(DocsAnalyticsEventSchema).pipe(Schema.maxItems(50)),
});

const ErrorMessageSchema = Schema.Struct({
  message: Schema.String,
});

/**
 * Read a thrown value's message when it is an Error-shaped object.
 *
 * @param cause - Caught value from SQLite or similar.
 * @returns The message, or an empty string.
 */
export function decodeThrownMessage(cause: unknown): string {
  const decoded = Schema.decodeUnknownEither(ErrorMessageSchema)(cause);
  return decoded._tag === 'Right' ? decoded.right.message : '';
}

/**
 * Read an optional string field from untrusted JSON properties.
 *
 * @param value - A property value.
 * @returns The string, or undefined.
 */
export function optionalStringField(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): string | undefined {
  const decoded = Schema.decodeUnknownEither(Schema.String)(value);
  return decoded._tag === 'Right' ? decoded.right : undefined;
}
