import { Effect } from 'effect';

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
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    return Effect.fail(new BoundedFormRejected(413, 'too-large'));
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) {
    return Effect.fail(new BoundedFormRejected(400, 'invalid'));
  }
  return Effect.tryPromise({
    try: async () => {
      const reader = request.body?.getReader();
      if (reader === undefined) {
        throw new BoundedFormRejected(400, 'invalid');
      }
      const chunks: Array<Uint8Array> = [];
      let total = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        total += next.value.byteLength;
        if (total > limit) {
          await reader.cancel().catch(() => undefined);
          throw new BoundedFormRejected(413, 'too-large');
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
        return new URLSearchParams(
          new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
        );
      } catch {
        throw new BoundedFormRejected(400, 'invalid');
      }
    },
    catch: cause =>
      cause instanceof BoundedFormRejected ? cause : new BoundedFormUnavailable(cause),
  });
}
