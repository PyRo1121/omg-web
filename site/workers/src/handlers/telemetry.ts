import { reportError, reportWarning } from '../observability';
// CLI telemetry event handlers
import { type Env, jsonResponse, errorResponse } from '../api';
import { Effect, Exit } from 'effect';
import { decodeJsonBody } from '../body';
import {
  BatchTelemetryRequestSchema,
  SingleTelemetryRequestSchema,
  type TelemetryEvent,
} from '../contracts/cli-telemetry';
import { resolveTelemetryIngestion } from '../telemetry-policy';

const MAX_EVENT_PAYLOAD_BYTES = 100 * 1024;
const MAX_BATCH_PAYLOAD_BYTES = 1024 * 1024;
const MAX_BATCH_SIZE = 500;
const MAX_STRING_LENGTH = 1000;
const MAX_ERROR_LENGTH = 5000;
const MAX_ARRAY_LENGTH = 100;
const RATE_LIMIT_WINDOW_SECONDS = 60;

/** Reject an invalid or oversized declared body before parsing JSON. */
function validateContentLength(request: Request, maxBytes: number): Response | undefined {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength === null) {
    return undefined;
  }

  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return errorResponse('Invalid Content-Length header', 400);
  }
  return bytes > maxBytes ? errorResponse('Payload too large', 413) : undefined;
}

/** Truncate a telemetry scalar instead of rejecting the event. */
function truncateString(
  value: string | number | boolean | null | undefined,
  maxLength: number
): string | null {
  if (value === null || value === undefined) return null;
  const stringValue = String(value);
  return stringValue.length > maxLength ? stringValue.slice(0, maxLength) : stringValue;
}

/** Sanitize every bounded event field once before statement construction. */
function sanitizeEvent(event: TelemetryEvent): TelemetryEvent {
  return {
    ...event,
    command: truncateString(event.command, MAX_STRING_LENGTH),
    subcommand: truncateString(event.subcommand, MAX_STRING_LENGTH),
    error: truncateString(event.error, MAX_ERROR_LENGTH),
    packages: event.packages?.slice(0, MAX_ARRAY_LENGTH) ?? [],
    session_id: truncateString(event.session_id, MAX_STRING_LENGTH),
    metric_type: truncateString(event.metric_type, MAX_STRING_LENGTH),
    context: truncateString(event.context, MAX_STRING_LENGTH),
    feature: truncateString(event.feature, MAX_STRING_LENGTH),
    event_type: truncateString(event.event_type, MAX_STRING_LENGTH),
    start_time: truncateString(event.start_time, MAX_STRING_LENGTH),
    end_time: truncateString(event.end_time, MAX_STRING_LENGTH),
  };
}

/** Apply rate limiting and resolve the license's persisted ingestion policy. */
async function authorizeTelemetry(
  env: Env,
  licenseKey: string
): Promise<
  | { readonly _tag: 'allowed'; readonly licenseId: string }
  | { readonly _tag: 'optedOut' }
  | { readonly _tag: 'rejected'; readonly response: Response }
> {
  if (env.API_RATE_LIMITER) {
    try {
      const { success } = await env.API_RATE_LIMITER.limit({ key: `telemetry:${licenseKey}` });
      if (!success) {
        const response = errorResponse('Rate limit exceeded', 429);
        response.headers.set('Retry-After', String(RATE_LIMIT_WINDOW_SECONDS));
        return { _tag: 'rejected', response };
      }
    } catch (error: unknown) {
      reportError('Rate limit check failed:', error);
    }
  } else {
    reportWarning('API_RATE_LIMITER binding not available, skipping rate limit');
  }

  const policyExit = await Effect.runPromiseExit(resolveTelemetryIngestion(env.DB, licenseKey));
  if (Exit.isFailure(policyExit)) {
    return {
      _tag: 'rejected',
      response: errorResponse('Failed to load telemetry policy', 500),
    };
  }
  if (policyExit.value._tag === 'invalidLicense') {
    return { _tag: 'rejected', response: errorResponse('Invalid license key', 401) };
  }
  return policyExit.value;
}

/** Build the D1 mutation shared by single and batch ingestion. */
function prepareTelemetryStatement(
  db: D1Database,
  licenseId: string,
  item: {
    readonly event: TelemetryEvent;
    readonly machine_id: string;
    readonly timestamp: string;
  }
): { readonly eventId: string; readonly statement: D1PreparedStatement } | undefined {
  const event = sanitizeEvent(item.event);
  const eventId = crypto.randomUUID();
  const machineId = truncateString(item.machine_id, MAX_STRING_LENGTH);
  const timestamp = truncateString(item.timestamp, MAX_STRING_LENGTH);

  switch (event.type) {
    case 'command':
      return {
        eventId,
        statement: db
          .prepare(
            `INSERT INTO command_event (
              id, license_id, machine_id, session_id, command, subcommand,
              packages, duration_ms, success, error, result_count, updated_count, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            eventId,
            licenseId,
            machineId,
            event.session_id,
            event.command,
            event.subcommand,
            JSON.stringify(event.packages),
            event.duration_ms || 0,
            event.success ? 1 : 0,
            event.error,
            event.result_count || null,
            event.updated_count || null,
            timestamp
          ),
      };
    case 'session':
      return {
        eventId,
        statement: db
          .prepare(
            `INSERT INTO session (
              id, license_id, machine_id, session_id, event_type,
              start_time, end_time, commands_run, duration_secs, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            eventId,
            licenseId,
            machineId,
            event.session_id,
            event.event_type,
            event.start_time,
            event.end_time,
            event.commands_run || null,
            event.duration_secs || null,
            timestamp
          ),
      };
    case 'performance':
      return {
        eventId,
        statement: db
          .prepare(
            `INSERT INTO performance_metric (
              id, license_id, machine_id, metric_type, duration_ms, context, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            eventId,
            licenseId,
            machineId,
            event.metric_type,
            event.duration_ms,
            event.context,
            timestamp
          ),
      };
    case 'feature':
      return {
        eventId,
        statement: db
          .prepare(
            `INSERT INTO feature_usage (
              id, license_id, machine_id, feature, enabled, metadata, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            eventId,
            licenseId,
            machineId,
            event.feature,
            event.enabled ? 1 : 0,
            JSON.stringify(event.metadata || {}),
            timestamp
          ),
      };
    default:
      return undefined;
  }
}

// Handle single telemetry event
export async function handleCliEvent(request: Request, env: Env): Promise<Response> {
  try {
    const contentLengthError = validateContentLength(request, MAX_EVENT_PAYLOAD_BYTES);
    if (contentLengthError) {
      return contentLengthError;
    }

    const decoded = await Effect.runPromiseExit(
      decodeJsonBody(request, SingleTelemetryRequestSchema)
    );
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    const body = decoded.value;
    if (!body.license_key) {
      return errorResponse('License key required', 401);
    }

    const authorization = await authorizeTelemetry(env, body.license_key);
    if (authorization._tag === 'rejected') {
      return authorization.response;
    }
    if (authorization._tag === 'optedOut') {
      return jsonResponse({ success: true, skipped: true, reason: 'telemetry_opt_out' });
    }

    const prepared = prepareTelemetryStatement(env.DB, authorization.licenseId, body);
    if (prepared === undefined) {
      return errorResponse('Invalid event type', 400);
    }
    await prepared.statement.run();
    return jsonResponse({ success: true, event_id: prepared.eventId });
  } catch (error: unknown) {
    reportError('CLI event error:', error);
    return errorResponse('Failed to process event', 500);
  }
}

// Handle batched telemetry events
export async function handleCliBatch(request: Request, env: Env): Promise<Response> {
  try {
    const contentLengthError = validateContentLength(request, MAX_BATCH_PAYLOAD_BYTES);
    if (contentLengthError) {
      return contentLengthError;
    }

    const decoded = await Effect.runPromiseExit(
      decodeJsonBody(request, BatchTelemetryRequestSchema)
    );
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    const events = decoded.value.events;
    if (events === undefined || events.length === 0) {
      return jsonResponse({ success: true, processed: 0 });
    }
    if (events.length > MAX_BATCH_SIZE) {
      return errorResponse(`Batch size exceeds limit of ${MAX_BATCH_SIZE} events`, 413);
    }

    const licenseKey = events.at(0)?.license_key;
    if (!licenseKey) {
      return errorResponse('License key required', 401);
    }
    if (events.some(event => event.license_key !== licenseKey)) {
      return errorResponse('Batch events must use the same license key', 400);
    }

    const authorization = await authorizeTelemetry(env, licenseKey);
    if (authorization._tag === 'rejected') {
      return authorization.response;
    }
    if (authorization._tag === 'optedOut') {
      return jsonResponse({
        success: true,
        processed: 0,
        skipped: events.length,
        reason: 'telemetry_opt_out',
      });
    }

    const statements: D1PreparedStatement[] = [];
    for (const item of events) {
      const prepared = prepareTelemetryStatement(env.DB, authorization.licenseId, item);
      if (prepared === undefined) {
        return errorResponse('Unsupported telemetry event type', 400);
      }
      statements.push(prepared.statement);
    }
    await env.DB.batch(statements);
    return jsonResponse({ success: true, processed: events.length });
  } catch (error: unknown) {
    reportError('CLI batch error:', error);
    return errorResponse('Failed to process batch', 500);
  }
}
