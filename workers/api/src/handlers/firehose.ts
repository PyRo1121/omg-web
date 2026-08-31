// Firehose handler — polled real-time event feed for the admin dashboard.
import { reportError } from '../observability';
import { Effect, Exit } from 'effect';

import { type Env, jsonResponse, errorResponse } from '../api';
import { forbiddenUnlessAdminSession } from '../admin-auth';
import { requireInternalSecret } from '../admin-secret';
import {
  decodeExtraRowArray,
  decodeStoredProperties,
  FirehoseEventRowSchema,
} from '../contracts/d1-extras';

/** `created_at` is written as 'YYYY-MM-DD HH:MM:SS'; accept only comparable shapes. */
const SINCE_PATTERN = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?$/;

/**
 * Return recent analytics events for the admin firehose view (GET /api/admin/firehose).
 *
 * @param request - Incoming request; supports `limit` (1–100, default 50) and
 *   `since` ('YYYY-MM-DD[ HH:MM:SS]') query parameters.
 * @param env - Worker bindings including D1.
 * @returns The decoded event page, or an error response.
 */
export async function handleGetFirehose(request: Request, env: Env): Promise<Response> {
  const denial = await forbiddenUnlessAdminSession(request, env);
  return denial ?? loadFirehoseResponse(request, env);
}

/** Private Svelte polling adapter that avoids minting a database session every five seconds. */
export async function handleInternalFirehose(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('X-Internal-Call') !== 'service-binding') {
    return errorResponse('Not found', 404);
  }
  const secret = await Effect.runPromiseExit(
    requireInternalSecret(request.headers.get('X-Admin-Secret'), [env.SVELTE_BFF_SECRET])
  );
  return Exit.isFailure(secret)
    ? errorResponse('Not found', 404)
    : loadFirehoseResponse(request, env);
}

async function loadFirehoseResponse(request: Request, env: Env): Promise<Response> {
  try {
    const url = URL.parse(request.url);
    if (url === null) {
      return errorResponse('Invalid request URL', 400);
    }
    // Clamp to [1, 100] — SQLite treats a non-positive LIMIT as unbounded.
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit >= 1 ? Math.min(requestedLimit, 100) : 50;
    const rawSince = url.searchParams.get('since');
    if (rawSince !== null && !SINCE_PATTERN.test(rawSince)) {
      return errorResponse('Invalid since parameter; expected YYYY-MM-DD[ HH:MM:SS]', 400);
    }
    // Normalize to the stored CURRENT_TIMESTAMP shape so string comparison is exact.
    const since = rawSince === null ? null : rawSince.replace('T', ' ');
    const statement = env.DB.prepare(`
      SELECT
        id,
        event_type,
        event_name,
        properties,
        timestamp,
        session_id,
        machine_id,
        version,
        platform,
        duration_ms,
        created_at
      FROM analytics_events
      ${since ? 'WHERE created_at > ?' : ''}
      ORDER BY created_at DESC LIMIT ?`);
    const { results } = since
      ? await statement.bind(since, limit).all()
      : await statement.bind(limit).all();

    const decodedEvents = await Effect.runPromiseExit(
      decodeExtraRowArray(
        FirehoseEventRowSchema,
        'Firehose event row has an invalid shape',
        results
      ).pipe(
        Effect.flatMap(events =>
          Effect.forEach(events, event =>
            decodeStoredProperties(event.properties).pipe(
              Effect.map(properties => ({ ...event, properties }))
            )
          )
        )
      )
    );
    if (Exit.isFailure(decodedEvents)) {
      return errorResponse('Failed to fetch firehose data', 500);
    }

    return jsonResponse({
      events: decodedEvents.value,
      count: decodedEvents.value.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    reportError('Firehose error:', error);
    return errorResponse('Failed to fetch firehose data', 500);
  }
}
