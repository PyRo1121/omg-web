import { reportError } from '../observability';
// Firehose Handler - Streaming real-time events to Admin Dashboard
import { Effect, Exit } from 'effect';
import { type Env, jsonResponse, errorResponse, validateSession, getAuthToken } from '../api';
import {
  decodeExtraRowArray,
  decodeStoredProperties,
  FirehoseEventRowSchema,
  customerIsAdmin,
} from '../contracts/d1-extras';

export async function handleGetFirehose(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Unauthorized', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid session', 401);
  }

  // Strictly Admin Only - Check admin column from database
  const adminCheck = await env.DB.prepare(`SELECT admin FROM customers WHERE id = ?`)
    .bind(auth.user.id)
    .first();
  if (!(await customerIsAdmin(adminCheck))) {
    return errorResponse('Forbidden', 403);
  }

  try {
    const url = URL.parse(request.url);
    if (url === null) {
      return errorResponse('Invalid request URL', 400);
    }
    // Clamp to [1, 100] — SQLite treats a non-positive LIMIT as unbounded.
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit >= 1 ? Math.min(requestedLimit, 100) : 50;
    const since = url.searchParams.get('since');
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
