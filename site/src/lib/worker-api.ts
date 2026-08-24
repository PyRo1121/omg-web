import { Effect } from 'effect';
import type * as Schema from 'effect/Schema';
import { parseApiError } from './dashboard-contract';
import { decodeWorkerHttp, type WorkerHttpParseError } from './contracts/worker-http';

/** The Worker HTTP response was not 2xx. */
export class WorkerApiHttpError extends Error {
  readonly _tag = 'WorkerApiHttpError';
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** The Worker request failed before a JSON body could be parsed. */
export class WorkerApiNetworkError extends Error {
  readonly _tag = 'WorkerApiNetworkError';
  constructor(override readonly cause?: unknown) {
    super('Request failed');
  }
}

/** Production origin of the licensing/analytics Worker (omg-saas). */
export const WORKER_API_ORIGIN = 'https://omg-api.latham.cloud';

/** Posts or gets JSON through a controlled HTTP boundary. */
export interface WorkerFetcher {
  fetch(input: string, init: RequestInit): Effect.Effect<Response, WorkerApiNetworkError>;
}

/** Any classified failure a Worker request can produce. */
export type WorkerApiFailure = WorkerApiHttpError | WorkerApiNetworkError | WorkerHttpParseError;

/** Browser fetch seam restricted to the same-origin BFF and one public telemetry route. */
export const browserWorkerFetcher: WorkerFetcher = {
  fetch(input, init) {
    return Effect.tryPromise({
      try: () => {
        const url = new URL(input, window.location.origin);
        const allowed =
          (url.origin === window.location.origin && url.pathname.startsWith('/api/licensing/')) ||
          (url.origin === WORKER_API_ORIGIN && url.pathname === '/api/site/analytics/track');
        if (!allowed) {
          throw new WorkerApiNetworkError(new Error('Worker API route is not allowed'));
        }
        return window.fetch(url, init);
      },
      catch: cause =>
        cause instanceof WorkerApiNetworkError ? cause : new WorkerApiNetworkError(cause),
    });
  },
};

/** Fetch a 2xx response body as raw text (CSV exports). */
export function requestText(
  fetcher: WorkerFetcher,
  url: string,
  init: RequestInit = {}
): Effect.Effect<string, WorkerApiHttpError | WorkerApiNetworkError> {
  return Effect.gen(function* () {
    const response = yield* fetcher.fetch(url, init);
    if (!response.ok) {
      const payload = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: cause => new WorkerApiNetworkError(cause),
      });
      return yield* Effect.fail(
        new WorkerApiHttpError(response.status, parseApiError(payload, 'Request failed'))
      );
    }
    return yield* Effect.tryPromise({
      try: () => response.text(),
      catch: cause => new WorkerApiNetworkError(cause),
    });
  });
}

/** Fetch JSON and Schema-decode the 2xx response body. */
export function requestDecodedJson<S extends Schema.Schema.AnyNoContext>(
  fetcher: WorkerFetcher,
  url: string,
  init: RequestInit,
  schema: S,
  reason: string
): Effect.Effect<
  Schema.Schema.Type<S>,
  WorkerApiHttpError | WorkerApiNetworkError | WorkerHttpParseError
> {
  return Effect.gen(function* () {
    const response = yield* fetcher.fetch(url, init);
    const payload = yield* Effect.tryPromise({
      try: async () => {
        const body: unknown = await response.json();
        return body;
      },
      catch: cause => new WorkerApiNetworkError(cause),
    });
    if (!response.ok) {
      return yield* Effect.fail(
        new WorkerApiHttpError(response.status, parseApiError(payload, 'Request failed'))
      );
    }
    return yield* decodeWorkerHttp(schema, reason, payload);
  });
}
