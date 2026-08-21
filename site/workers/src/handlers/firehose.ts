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
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
    const since = url.searchParams.get('since'); // ISO timestamp
    let query = `
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
    `;

    const params: Array<string | number> = [];

    if (since) {
      query += ` WHERE created_at > ?`;
      params.push(since);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const { results } = await env.DB.prepare(query)
      .bind(...params)
      .all();

    const decoded = await Effect.runPromiseExit(
      decodeExtraRowArray(
        FirehoseEventRowSchema,
        'Firehose event row has an invalid shape',
        results
      )
    );
    if (Exit.isFailure(decoded)) {
      return errorResponse('Failed to fetch firehose data', 500);
    }

    const decodedEvents = await Effect.runPromiseExit(
      Effect.forEach(decoded.value, event =>
        decodeStoredProperties(event.properties).pipe(
          Effect.map(properties => ({
            ...event,
            properties,
          }))
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
