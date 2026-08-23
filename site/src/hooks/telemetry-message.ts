import * as Schema from 'effect/Schema';

/** Raw value accepted only at the WebSocket Schema boundary. */
type TelemetryBoundaryInput = Schema.Schema.Encoded<Schema.Schema.Any>;

const FiniteNumber = Schema.Number.pipe(Schema.finite());
const LicenseTierSchema = Schema.Union(
  Schema.Literal('free'),
  Schema.Literal('pro'),
  Schema.Literal('team'),
  Schema.Literal('enterprise')
);

const GeoSchema = Schema.Struct({
  country_code: Schema.String,
  country: Schema.String,
  region: Schema.optional(Schema.String),
  city: Schema.optional(Schema.String),
  latitude: Schema.optional(FiniteNumber),
  longitude: Schema.optional(FiniteNumber),
});

const CommandEventSchema = Schema.Struct({
  id: Schema.String,
  license_key: Schema.String,
  license_tier: LicenseTierSchema,
  user_email: Schema.optional(Schema.String),
  command: Schema.String,
  package_name: Schema.optional(Schema.String),
  duration_ms: FiniteNumber,
  status: Schema.Union(Schema.Literal('success'), Schema.Literal('error')),
  error_message: Schema.optional(Schema.String),
  platform: Schema.String,
  version: Schema.String,
  hostname: Schema.optional(Schema.String),
  machine_id: Schema.String,
  geo: Schema.optional(GeoSchema),
  timestamp: Schema.String,
});

/** A single command executed by the OMG CLI. */
export type CommandEvent = Schema.Schema.Type<typeof CommandEventSchema>;

const SessionEventSchema = Schema.Struct({
  session_id: Schema.String,
  license_key: Schema.String,
  license_tier: LicenseTierSchema,
  machine_id: Schema.String,
  hostname: Schema.optional(Schema.String),
  platform: Schema.String,
  version: Schema.String,
  geo: Schema.optional(GeoSchema),
  started_at: Schema.String,
  last_activity_at: Schema.String,
  command_count: FiniteNumber,
  is_active: Schema.Boolean,
});

/** A CLI session that started or ended. */
export type SessionEvent = Schema.Schema.Type<typeof SessionEventSchema>;

const HealthUpdateSchema = Schema.Struct({
  overall_score: FiniteNumber,
  engagement_score: FiniteNumber,
  adoption_score: FiniteNumber,
  satisfaction_score: FiniteNumber,
  previous_score: Schema.optional(FiniteNumber),
  trend: Schema.Union(Schema.Literal('up'), Schema.Literal('down'), Schema.Literal('stable')),
  updated_at: Schema.String,
});

/** A periodic health score update. */
export type HealthUpdate = Schema.Schema.Type<typeof HealthUpdateSchema>;

const TelemetryMessageSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal('command_event'),
    data: CommandEventSchema,
    timestamp: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('session_start'),
    data: SessionEventSchema,
    timestamp: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('session_end'),
    data: SessionEventSchema,
    timestamp: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('health_update'),
    data: HealthUpdateSchema,
    timestamp: Schema.String,
  })
);

/** A telemetry message discriminated by its event type. */
export type TelemetryMessage = Schema.Schema.Type<typeof TelemetryMessageSchema>;

/** Parse a raw WebSocket payload into a typed telemetry message. */
export function parseTelemetryMessage(value: TelemetryBoundaryInput): TelemetryMessage | null {
  const decoded = Schema.decodeUnknownEither(TelemetryMessageSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
