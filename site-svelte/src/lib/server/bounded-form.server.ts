import { Effect } from 'effect';
import { BoundedBodyTooLarge, BoundedBodyUnavailable, readBoundedBody } from '../bounded-body';

export class BoundedFormRejected extends Error {
  readonly _tag = 'BoundedFormRejected';
  constructor(
    readonly status: 400 | 413,
    readonly reason: 'invalid' | 'too-large'
  ) {
    super(`Form request is ${reason}`);
  }
}

export class BoundedFormUnavailable extends Error {
  readonly _tag = 'BoundedFormUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Form request is unavailable');
  }
}

/** Return one unambiguous form parameter and reject missing or repeated values. */
export function readSingleFormParameter(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  return values.length === 1 ? (values[0] ?? null) : null;
}

/** Read one URL-encoded request body without allowing an unbounded allocation. */
export function readBoundedUrlEncodedForm(
  request: Request,
  limit: number
): Effect.Effect<URLSearchParams, BoundedFormRejected | BoundedFormUnavailable> {
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) {
    return Effect.fail(new BoundedFormRejected(400, 'invalid'));
  }
  return Effect.tryPromise({
    try: async () => {
      const bytes = new Uint8Array(await readBoundedBody(request, limit));
      try {
        return new URLSearchParams(
          new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
        );
      } catch {
        throw new BoundedFormRejected(400, 'invalid');
      }
    },
    catch: cause => {
      if (cause instanceof BoundedFormRejected) return cause;
      if (cause instanceof BoundedBodyTooLarge) {
        return new BoundedFormRejected(413, 'too-large');
      }
      if (cause instanceof BoundedBodyUnavailable) {
        return new BoundedFormRejected(400, 'invalid');
      }
      return new BoundedFormUnavailable(cause);
    },
  });
}
