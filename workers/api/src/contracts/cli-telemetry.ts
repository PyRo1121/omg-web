// Boundary parser internals decode CLI telemetry JSON.

import * as Schema from 'effect/Schema';

const OptionalBoolean = Schema.optional(Schema.Boolean);
const OptionalCount = Schema.optional(
  Schema.Number.pipe(Schema.int(), Schema.between(0, 1_000_000_000))
);
const OptionalDurationMs = Schema.optional(
  Schema.Number.pipe(Schema.int(), Schema.between(0, 31 * 24 * 60 * 60 * 1000))
);
const OptionalDurationSecs = Schema.optional(
  Schema.Number.pipe(Schema.int(), Schema.between(0, 31 * 24 * 60 * 60))
);
const OptionalRetries = Schema.optional(Schema.Number.pipe(Schema.int(), Schema.between(0, 100)));
const OptionalString = Schema.optional(Schema.Union(Schema.Null, Schema.String));
const JsonAtom = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);

/** One CLI telemetry event. Type is checked after decode so invalid types keep the existing 400 message. */
const TelemetryEventSchema = Schema.Struct({
  type: Schema.String,
  command: OptionalString,
  subcommand: OptionalString,
  packages: Schema.optional(Schema.Array(Schema.String)),
  duration_ms: OptionalDurationMs,
  success: OptionalBoolean,
  error: OptionalString,
  result_count: OptionalCount,
  updated_count: OptionalCount,
  session_id: OptionalString,
  event_type: OptionalString,
  start_time: OptionalString,
  end_time: OptionalString,
  commands_run: OptionalCount,
  duration_secs: OptionalDurationSecs,
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
  license_key: Schema.optional(Schema.String.pipe(Schema.maxLength(256))),
  retries: OptionalRetries,
});

/** Envelope for a single CLI event. */
export const SingleTelemetryRequestSchema = TelemetryEnvelopeSchema;

/** Envelope for a CLI event batch. Cap mirrors the handler's MAX_BATCH_SIZE. */
export const BatchTelemetryRequestSchema = Schema.Struct({
  events: Schema.optional(Schema.Array(TelemetryEnvelopeSchema).pipe(Schema.maxItems(500))),
  batch_timestamp: Schema.optional(Schema.String),
  machine_id: Schema.optional(Schema.String),
});
