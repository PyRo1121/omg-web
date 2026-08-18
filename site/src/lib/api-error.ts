/**
 * HTTP 500 when persisted D1 rows cannot be parsed.
 *
 * @returns A JSON 500 response that does not leak parse details.
 */
export function storedDataErrorResponse(): Response {
  return new Response(JSON.stringify({ error: 'Failed to load stored data' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * HTTP 500 for unexpected handler failures.
 *
 * @returns A JSON 500 response that does not leak internal error details.
 */
export function internalErrorResponse(): Response {
  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
