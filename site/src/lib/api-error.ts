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
