import { fail, succeed, tryPromise, gen } from 'effect/Effect';
import type { Effect } from 'effect';
import * as Schema from 'effect/Schema';

/** A request body that is not valid JSON or does not match its contract schema. */
export class InvalidJsonBodyError extends Error {
  readonly _tag = 'InvalidJsonBodyError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super('Invalid JSON body');
  }
}

/** A provider response that is oversized, malformed UTF-8, or invalid JSON. */
export class InvalidJsonResponseError extends Error {
  readonly _tag = 'InvalidJsonResponseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super('Invalid JSON response');
  }
}

/** Internal failure while consuming a bounded UTF-8 body stream. */
class BoundedBodyReadError extends Error {
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** Largest JSON body any Worker HTTP boundary will buffer before decoding. */
const MAX_JSON_BODY_BYTES = 1024 * 1024;

async function readBoundedUtf8Body(
  headers: Headers,
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<string> {
  const declaredLength = Number(headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BoundedBodyReadError('Body exceeds the maximum allowed size');
  }

  const reader = body?.getReader();
  if (reader === undefined) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BoundedBodyReadError('Body exceeds the maximum allowed size');
    }
    chunks.push(next.value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch (cause: unknown) {
    throw new BoundedBodyReadError('Body is not valid UTF-8', cause);
  }
}

/**
 * Reject cross-origin form-style bodies early: browsers always declare an
 * explicit Content-Type on form and navigation submissions, so anything that is
 * not `application/json` (or a `+json` structured suffix) cannot be a same-app
 * API call. A missing header is tolerated for minimal clients that omit it.
 */
function ensureJsonContentType(request: Request): Effect.Effect<void, InvalidJsonBodyError> {
  const contentType = request.headers.get('Content-Type');
  if (contentType !== null && !/^application\/[a-z0-9.+-]*json\b/i.test(contentType.trim())) {
    return fail(new InvalidJsonBodyError('Content-Type must be application/json'));
  }
  return succeed(undefined);
}

/**
 * Read the full body as UTF-8 text under a hard byte cap.
 *
 * The declared Content-Length is checked first for cheap rejection, then the
 * stream itself is counted so chunked or lying clients cannot exceed the cap.
 *
 * @param request - Incoming request whose stream is consumed once.
 * @param maxBytes - Maximum buffered byte count for this protocol boundary.
 * @returns The decoded UTF-8 body or an explicit bounded-read failure.
 */
export function readBoundedBodyText(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES
): Effect.Effect<string, InvalidJsonBodyError> {
  return tryPromise({
    try: () => readBoundedUtf8Body(request.headers, request.body, maxBytes),
    catch: cause =>
      cause instanceof BoundedBodyReadError
        ? new InvalidJsonBodyError(cause.reason, cause.cause)
        : new InvalidJsonBodyError('Request body could not be read', cause),
  });
}

/**
 * Read an external JSON response under a hard byte cap and strict UTF-8 policy.
 *
 * Both declared and streamed lengths are enforced before JSON parsing. This is
 * the response-side companion to {@link decodeJsonBody}; provider schemas are
 * applied by the caller after this transport boundary succeeds.
 */
export function decodeBoundedJsonResponse(
  response: Response,
  maxBytes: number
): Effect.Effect<unknown, InvalidJsonResponseError> {
  return tryPromise({
    try: async () => {
      const text = await readBoundedUtf8Body(response.headers, response.body, maxBytes);
      try {
        const payload: unknown = JSON.parse(text);
        return payload;
      } catch (cause: unknown) {
        throw new InvalidJsonResponseError('Response body is not valid JSON', cause);
      }
    },
    catch: cause => {
      if (cause instanceof InvalidJsonResponseError) {
        return cause;
      }
      if (cause instanceof BoundedBodyReadError) {
        return new InvalidJsonResponseError(cause.reason, cause.cause);
      }
      return new InvalidJsonResponseError('Response body could not be read', cause);
    },
  });
}

/**
 * Read and decode a request body against a schema at the HTTP boundary.
 *
 * Failures returned through the Effect error channel cover: a non-JSON
 * Content-Type, a body over {@link MAX_JSON_BODY_BYTES}, invalid JSON, and a
 * payload that does not match the contract schema. The caller translates them
 * into an HTTP response (typically 400).
 *
 * @param request - The incoming request whose body is read once.
 * @param schema - The contract schema the body must satisfy.
 * @param maxBytes - The maximum number of request bytes to buffer.
 * @returns The decoded body, or `InvalidJsonBodyError`.
 */
export function decodeJsonBody<S extends Schema.Schema.AnyNoContext>(
  request: Request,
  schema: S,
  maxBytes = MAX_JSON_BODY_BYTES
): Effect.Effect<Schema.Schema.Type<S>, InvalidJsonBodyError> {
  return gen(function* () {
    yield* ensureJsonContentType(request);
    const text = yield* readBoundedBodyText(request, maxBytes);
    const parsed = Schema.decodeUnknownEither(Schema.parseJson())(text);
    if (parsed._tag === 'Left') {
      return yield* fail(new InvalidJsonBodyError('Body is not valid JSON', parsed.left));
    }
    const decoded = Schema.decodeUnknownEither(schema)(parsed.right);
    return decoded._tag === 'Left'
      ? yield* fail(new InvalidJsonBodyError('Body does not match the expected contract'))
      : yield* succeed(decoded.right);
  });
}
