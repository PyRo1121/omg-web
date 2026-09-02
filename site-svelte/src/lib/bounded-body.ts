export class BoundedBodyTooLarge extends Error {
  readonly _tag = 'BoundedBodyTooLarge';

  constructor() {
    super('Response body exceeds its byte limit');
  }
}

export class BoundedBodyUnavailable extends Error {
  readonly _tag = 'BoundedBodyUnavailable';

  constructor(override readonly cause?: unknown) {
    super('Response body is unavailable');
  }
}

/** Read a request or response body into one buffer under a fixed byte ceiling. */
export async function readBoundedBody(
  response: Request | Response,
  limit: number
): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw new BoundedBodyTooLarge();
  }

  const reader = response.body?.getReader();
  if (reader === undefined) throw new BoundedBodyUnavailable();

  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new BoundedBodyTooLarge();
    }
    chunks.push(next.value);
  }

  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}
