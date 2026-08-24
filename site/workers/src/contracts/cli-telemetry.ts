// Boundary parser internals decode CLI telemetry JSON.

import * as Schema from 'effect/Schema';

const OptionalBoolean = Schema.optional(Schema.Boolean);
const OptionalNumber = Schema.optional(Schema.Number);
const OptionalString = Schema.optional(Schema.Union(Schema.Null, Schema.String));
const JsonAtom = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);

/** One CLI telemetry event. Type is checked after decode so invalid types keep the existing 400 message. */
const TelemetryEventSchema = Schema.Struct({
  type: Schema.String,
  command: OptionalString,
  subcommand: OptionalString,
  packages: Schema.optional(Schema.Array(Schema.String)),
  duration_ms: OptionalNumber,
  success: OptionalBoolean,
  error: OptionalString,
  result_count: OptionalNumber,
  updated_count: OptionalNumber,
  session_id: OptionalString,
  event_type: OptionalString,
  start_time: OptionalString,
  end_time: OptionalString,
  commands_run: OptionalNumber,
  duration_secs: OptionalNumber,
  metric_type: OptionalString,
  context: OptionalString,
  feature: OptionalString,
  enabled: OptionalBoolean,
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: JsonAtom })),
});
export type TelemetryEvent = Schema.Schema.Type<typeof TelemetryEventSchema>;

/** Shared envelope fields for a single CLI event and each item of a batch. */
const TelemetryEnvelopeSchema = Schema.Struct({
  event: TelemetryEventSchema,
  timestamp: Schema.String,
  machine_id: Schema.String,
  version: Schema.String,
  platform: Schema.String,
  license_key: Schema.optional(Schema.String),
  retries: OptionalNumber,
});

/** Envelope for a single CLI event. */
export const SingleTelemetryRequestSchema = TelemetryEnvelopeSchema;

/** Envelope for a CLI event batch. Cap mirrors the handler's MAX_BATCH_SIZE. */
export const BatchTelemetryRequestSchema = Schema.Struct({
  events: Schema.optional(Schema.Array(TelemetryEnvelopeSchema).pipe(Schema.maxItems(500))),
  batch_timestamp: Schema.optional(Schema.String),
  machine_id: Schema.optional(Schema.String),
});
