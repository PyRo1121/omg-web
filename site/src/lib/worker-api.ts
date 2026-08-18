import { Effect } from 'effect';
import { parseApiError } from './dashboard-contract';
import {
  AuthParseError,
  decodeSendCodeRequest,
  decodeSendCodeResponse,
  decodeVerifyCodeRequest,
  decodeVerifyCodeResponse,
  type SendCodeResponse,
  type VerifyCodeResponse,
} from './contracts/otp-auth';
import {
  decodeWorkerDashboard,
  WorkerDashboardParseError,
  type WorkerDashboardData,
} from './contracts/worker-dashboard';

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

export type WorkerApiError =
  WorkerApiHttpError | WorkerApiNetworkError | AuthParseError | WorkerDashboardParseError;

/** Posts or gets JSON from the Worker. */
export interface WorkerFetcher {
  fetch(input: string, init: RequestInit): Effect.Effect<Response, WorkerApiNetworkError>;
}

/** Browser `fetch` seam used by the dashboard API wrappers. */
export const browserWorkerFetcher: WorkerFetcher = {
  fetch(input, init) {
    return Effect.tryPromise({
      try: () => fetch(input, init),
      catch: cause => new WorkerApiNetworkError(cause),
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
      yield* Effect.fail(
        new WorkerApiHttpError(response.status, parseApiError(payload, 'Request failed'))
      );
    }
    return payload;
  });
}

function jsonHeaders(token: string | null): Headers {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (token !== null && token.length > 0) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

/**
 * POST `/api/auth/send-code` and decode the success payload.
 *
 * @param apiBase - Worker origin, with no trailing slash.
 * @param email - Address that should receive the OTP.
 * @param turnstileToken - Optional Turnstile token.
 * @param fetcher - Fetch seam.
 * @returns The typed send-code payload, or a tagged Worker API error.
 */
export function sendCodeToWorker(
  apiBase: string,
  email: string,
  turnstileToken: string | undefined,
  fetcher: WorkerFetcher
): Effect.Effect<SendCodeResponse, WorkerApiError> {
  return Effect.gen(function* () {
    const body = turnstileToken === undefined ? { email } : { email, turnstileToken };
    const request = yield* decodeSendCodeRequest(body).pipe(
      Effect.mapError(error => new WorkerApiHttpError(400, error.reason))
    );
    const payload = yield* requestJson(fetcher, `${apiBase}/api/auth/send-code`, {
      method: 'POST',
      headers: jsonHeaders(null),
      body: JSON.stringify(request),
    });
    return yield* decodeSendCodeResponse(payload);
  });
}

/**
 * POST `/api/auth/verify-code` and decode the session payload.
 *
 * @param apiBase - Worker origin, with no trailing slash.
 * @param email - Address that requested the OTP.
 * @param code - One-time code.
 * @param fetcher - Fetch seam.
 * @returns The typed session payload, or a tagged Worker API error.
 */
export function verifyCodeWithWorker(
  apiBase: string,
  email: string,
  code: string,
  fetcher: WorkerFetcher
): Effect.Effect<VerifyCodeResponse, WorkerApiError> {
  return Effect.gen(function* () {
    const request = yield* decodeVerifyCodeRequest({ email, code }).pipe(
      Effect.mapError(error => new WorkerApiHttpError(400, error.reason))
    );
    const payload = yield* requestJson(fetcher, `${apiBase}/api/auth/verify-code`, {
      method: 'POST',
      headers: jsonHeaders(null),
      body: JSON.stringify(request),
    });
    return yield* decodeVerifyCodeResponse(payload);
  });
}

/**
 * GET `/api/dashboard` with the stored Worker session and decode the payload.
 *
 * @param apiBase - Worker origin, with no trailing slash.
 * @param token - Bearer session token, or `null` when none is stored.
 * @param fetcher - Fetch seam.
 * @returns The typed licensing dashboard, or a tagged Worker API error.
 */
export function getWorkerDashboard(
  apiBase: string,
  token: string | null,
  fetcher: WorkerFetcher
): Effect.Effect<WorkerDashboardData, WorkerApiError> {
  return Effect.gen(function* () {
    const payload = yield* requestJson(fetcher, `${apiBase}/api/dashboard`, {
      method: 'GET',
      headers: jsonHeaders(token),
    });
    return yield* decodeWorkerDashboard(payload);
  });
}
