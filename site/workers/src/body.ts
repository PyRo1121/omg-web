import { tryPromise, fail, succeed, flatMap } from 'effect/Effect';
import type { Effect } from 'effect';
import { decodeUnknownEither } from 'effect/Schema';
import type * as Schema from 'effect/Schema';

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

/**
 * Read and decode a request body against a schema at the HTTP boundary.
 *
 * Expected failures are returned through the Effect error channel; the caller
 * translates them into an HTTP response (typically 400).
 *
 * @param request - The incoming request whose body is read once.
 * @param schema - The contract schema the body must satisfy.
 * @returns The decoded body, or `InvalidJsonBodyError`.
 */
export function decodeJsonBody<S extends Schema.Schema.AnyNoContext>(
  request: Request,
  schema: S
): Effect.Effect<Schema.Schema.Type<S>, InvalidJsonBodyError> {
  return tryPromise({
    try: () => request.json(),
    catch: cause => new InvalidJsonBodyError('Body is not valid JSON', cause),
  }).pipe(
    flatMap(payload => {
      const decoded = decodeUnknownEither(schema)(payload);
      return decoded._tag === 'Left'
        ? fail(new InvalidJsonBodyError('Body does not match the expected contract'))
        : succeed(decoded.right);
    })
  );
}
