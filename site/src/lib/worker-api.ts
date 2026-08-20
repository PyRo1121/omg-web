import { Effect } from 'effect';
import type { Schema } from '@effect/schema';
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
  constructor(readonly cause?: unknown) {
    super('Request failed');
  }
}

export type WorkerApiError = WorkerApiHttpError | WorkerApiNetworkError | WorkerHttpParseError;

/** Posts or gets JSON through a controlled HTTP boundary. */
export interface WorkerFetcher {
  fetch(input: string, init: RequestInit): Effect.Effect<Response, WorkerApiNetworkError>;
}

function allowedBrowserRequestUrl(input: string): URL {
  const url = new URL(input, window.location.origin);
  const sameOriginLicensingRoute =
    url.origin === window.location.origin && url.pathname.startsWith('/api/licensing/');
  const publicAnalyticsRoute =
    url.origin === 'https://api.pyro1121.com' && url.pathname === '/api/site/analytics/track';
  if (!sameOriginLicensingRoute && !publicAnalyticsRoute) {
    throw new WorkerApiNetworkError(new Error('Worker API route is not allowed'));
  }
  return url;
}

/** Browser fetch seam restricted to the same-origin BFF and one public telemetry route. */
export const browserWorkerFetcher: WorkerFetcher = {
  fetch(input, init) {
    return Effect.tryPromise({
      try: () => window.fetch(allowedBrowserRequestUrl(input), init),
      catch: cause =>
        cause instanceof WorkerApiNetworkError ? cause : new WorkerApiNetworkError(cause),
    });
  },
};

function readJsonBody(response: Response): Effect.Effect<unknown, WorkerApiNetworkError> {
  return Effect.tryPromise({
    try: async () => {
      const payload: unknown = await response.json();
      return payload;
    },
    catch: cause => new WorkerApiNetworkError(cause),
  });
}

function requestJson(
  fetcher: WorkerFetcher,
  url: string,
  init: RequestInit
): Effect.Effect<unknown, WorkerApiHttpError | WorkerApiNetworkError> {
  return Effect.gen(function* () {
    const response = yield* fetcher.fetch(url, init);
    const payload = yield* readJsonBody(response);
    if (!response.ok) {
      return yield* Effect.fail(
        new WorkerApiHttpError(response.status, parseApiError(payload, 'Request failed'))
      );
    }
    return payload;
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
  return requestJson(fetcher, url, init).pipe(
    Effect.flatMap(payload => decodeWorkerHttp(schema, reason, payload))
  );
}
