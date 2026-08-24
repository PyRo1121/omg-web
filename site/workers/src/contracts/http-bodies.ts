// Boundary parser internals decode remaining Worker HTTP JSON bodies.

import * as Schema from 'effect/Schema';

const OptionalBoolean = Schema.optional(Schema.Boolean);
const OptionalNumber = Schema.optional(Schema.Number);

/** Non-empty caller-supplied identifier, capped against oversized D1 keys. */
const BoundedId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));

/** CRM note body accepted from the admin UI's note editor. */
const NoteContent = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(4000));

/** Note classifications offered by the admin notes UI (`NOTE_TYPES`). */
const NoteType = Schema.Literal('general', 'call', 'email', 'meeting', 'support', 'sales');

/** License tiers recognized by MRR pricing and badge rendering. */
const LicenseTier = Schema.Literal('free', 'pro', 'team', 'enterprise');

/** License statuses an admin may set (privacy deletion writes `deleted_by_user` directly). */
const AdminLicenseStatus = Schema.Literal('active', 'inactive');

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
  name: Schema.optional(Schema.String.pipe(Schema.maxLength(120))),
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
  timestamp: OptionalNumber,
  session_id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  duration_ms: OptionalNumber,
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
  duration_ms: OptionalNumber,
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
