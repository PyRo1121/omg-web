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

/** Largest JSON body any Worker HTTP boundary will buffer before decoding. */
const MAX_JSON_BODY_BYTES = 1024 * 1024;

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
    try: async () => {
      const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new InvalidJsonBodyError('Request body exceeds the maximum allowed size');
      }

      const reader = request.body?.getReader();
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
          throw new InvalidJsonBodyError('Request body exceeds the maximum allowed size');
        }
        chunks.push(next.value);
      }

      const body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(body);
    },
    catch: cause =>
      cause instanceof InvalidJsonBodyError
        ? cause
        : new InvalidJsonBodyError('Request body could not be read', cause),
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
 * @returns The decoded body, or `InvalidJsonBodyError`.
 */
export function decodeJsonBody<S extends Schema.Schema.AnyNoContext>(
  request: Request,
  schema: S
): Effect.Effect<Schema.Schema.Type<S>, InvalidJsonBodyError> {
  return gen(function* () {
    yield* ensureJsonContentType(request);
    const text = yield* readBoundedBodyText(request);
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
