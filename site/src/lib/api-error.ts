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

/** A classified HTTP/API failure surfaced at the Promise-based UI boundary. */
export class ApiError extends Error {
  readonly _tag = 'ApiError';

  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
