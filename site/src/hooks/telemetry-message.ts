// Boundary parser internals intentionally inspect unknown WebSocket payloads and
// dynamic object fields. The narrow suppression is limited to this parser module;
// callers receive the typed TelemetryMessage discriminated union.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get -- Safe JSON boundary parsing requires these operations.

/** A single command executed by the OMG CLI. */
export interface CommandEvent {
  id: string;
  license_key: string;
  license_tier: 'free' | 'pro' | 'team' | 'enterprise';
  user_email?: string;
  command: string;
  package_name?: string;
  duration_ms: number;
  status: 'success' | 'error';
  error_message?: string;
  platform: string;
  version: string;
  hostname?: string;
  machine_id: string;
  geo?: {
    country_code: string;
    country: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  timestamp: string;
}

/** A CLI session that started or ended. */
export interface SessionEvent {
  session_id: string;
  license_key: string;
  license_tier: 'free' | 'pro' | 'team' | 'enterprise';
  machine_id: string;
  hostname?: string;
  platform: string;
  version: string;
  geo?: {
    country_code: string;
    country: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  started_at: string;
  last_activity_at: string;
  command_count: number;
  is_active: boolean;
}

/** A periodic health score update. */
export interface HealthUpdate {
  overall_score: number;
  engagement_score: number;
  adoption_score: number;
  satisfaction_score: number;
  previous_score?: number;
  trend: 'up' | 'down' | 'stable';
  updated_at: string;
}

/** The event types the realtime feed can deliver. */
export type TelemetryEventType =
  'command_event' | 'session_start' | 'session_end' | 'health_update';

/** A telemetry message discriminated by its event type. */
export type TelemetryMessage =
  | {
      readonly type: 'command_event';
      readonly data: CommandEvent;
      readonly timestamp: string;
    }
  | {
      readonly type: 'session_start';
      readonly data: SessionEvent;
      readonly timestamp: string;
    }
  | {
      readonly type: 'session_end';
      readonly data: SessionEvent;
      readonly timestamp: string;
    }
  | {
      readonly type: 'health_update';
      readonly data: HealthUpdate;
      readonly timestamp: string;
    };

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(value: object, name: string): unknown {
  return Reflect.get(value, name);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isNumber(value);
}

function isTier(value: unknown): value is CommandEvent['license_tier'] {
  return value === 'free' || value === 'pro' || value === 'team' || value === 'enterprise';
}

function isCommandStatus(value: unknown): value is CommandEvent['status'] {
  return value === 'success' || value === 'error';
}

function isTrend(value: unknown): value is HealthUpdate['trend'] {
  return value === 'up' || value === 'down' || value === 'stable';
}

function isGeo(value: unknown): boolean {
  return (
    isObject(value) &&
    isString(field(value, 'country_code')) &&
    isString(field(value, 'country')) &&
    isOptionalString(field(value, 'region')) &&
    isOptionalString(field(value, 'city')) &&
    isOptionalNumber(field(value, 'latitude')) &&
    isOptionalNumber(field(value, 'longitude'))
  );
}

function isCommandEvent(value: unknown): value is CommandEvent {
  return (
    isObject(value) &&
    isString(field(value, 'id')) &&
    isString(field(value, 'license_key')) &&
    isTier(field(value, 'license_tier')) &&
    isOptionalString(field(value, 'user_email')) &&
    isString(field(value, 'command')) &&
    isOptionalString(field(value, 'package_name')) &&
    isNumber(field(value, 'duration_ms')) &&
    isCommandStatus(field(value, 'status')) &&
    isOptionalString(field(value, 'error_message')) &&
    isString(field(value, 'platform')) &&
    isString(field(value, 'version')) &&
    isOptionalString(field(value, 'hostname')) &&
    isString(field(value, 'machine_id')) &&
    (field(value, 'geo') === undefined || isGeo(field(value, 'geo'))) &&
    isString(field(value, 'timestamp'))
  );
}

function isSessionEvent(value: unknown): value is SessionEvent {
  return (
    isObject(value) &&
    isString(field(value, 'session_id')) &&
    isString(field(value, 'license_key')) &&
    isTier(field(value, 'license_tier')) &&
    isString(field(value, 'machine_id')) &&
    isOptionalString(field(value, 'hostname')) &&
    isString(field(value, 'platform')) &&
    isString(field(value, 'version')) &&
    (field(value, 'geo') === undefined || isGeo(field(value, 'geo'))) &&
    isString(field(value, 'started_at')) &&
    isString(field(value, 'last_activity_at')) &&
    isNumber(field(value, 'command_count')) &&
    isBoolean(field(value, 'is_active'))
  );
}

function isHealthUpdate(value: unknown): value is HealthUpdate {
  return (
    isObject(value) &&
    isNumber(field(value, 'overall_score')) &&
    isNumber(field(value, 'engagement_score')) &&
    isNumber(field(value, 'adoption_score')) &&
    isNumber(field(value, 'satisfaction_score')) &&
    isOptionalNumber(field(value, 'previous_score')) &&
    isTrend(field(value, 'trend')) &&
    isString(field(value, 'updated_at'))
  );
}

/**
 * Parse a raw WebSocket payload into a typed telemetry message.
 *
 * @param value - The untrusted JSON payload received over the socket.
 * @returns A typed message, or `null` when the payload does not match any known event shape.
 */
export function parseTelemetryMessage(value: unknown): TelemetryMessage | null {
  if (!isObject(value) || !isString(field(value, 'timestamp'))) return null;
  const data = field(value, 'data');
  // SAFETY: The isString guard above establishes the timestamp field type.
  const timestamp = field(value, 'timestamp') as string;

  switch (field(value, 'type')) {
    case 'command_event':
      return isCommandEvent(data) ? { type: 'command_event', data, timestamp } : null;
    case 'session_start':
      return isSessionEvent(data) ? { type: 'session_start', data, timestamp } : null;
    case 'session_end':
      return isSessionEvent(data) ? { type: 'session_end', data, timestamp } : null;
    case 'health_update':
      return isHealthUpdate(data) ? { type: 'health_update', data, timestamp } : null;
    default:
      return null;
  }
}
