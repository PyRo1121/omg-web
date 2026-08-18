import { Cause, Effect, Exit, Option } from 'effect';
import { createSignal, type Accessor } from 'solid-js';
import { parseAccountDashboard, type DashboardData } from '~/lib/contracts/dashboard';
import {
  parseTelemetryDashboard,
  type TelemetryDashboard,
} from '~/lib/contracts/telemetry-dashboard';
import { decodeAdminSessionClientResponse } from '~/lib/contracts/admin-session';
import { parseApiError } from '~/lib/dashboard-contract';

const SESSION_TOKEN_KEY = 'omg_session_token';

/** A failure while loading or decoding the account dashboard. */
export class DashboardLoadError extends Error {
  readonly _tag = 'DashboardLoadError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** A failure while loading or decoding the telemetry dashboard. */
export class TelemetryLoadError extends Error {
  readonly _tag = 'TelemetryLoadError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** A failure while minting the Worker admin session for the dashboard. */
export class AdminAuthSyncError extends Error {
  readonly _tag = 'AdminAuthSyncError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** A fetch function used by the dashboard view-model. */
export type DashboardFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Session token storage used by the dashboard view-model. */
export interface SessionTokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const loadDashboardPipeline = (fetchImpl: DashboardFetch) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchImpl('/api/dashboard'),
      catch: cause => new DashboardLoadError('Network request failed', cause),
    });
    if (!response.ok) {
      yield* Effect.fail(new DashboardLoadError('Failed to load dashboard data'));
    }
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause => new DashboardLoadError('Invalid JSON payload', cause),
    });
    return yield* parseAccountDashboard(payload).pipe(
      Effect.mapError(cause => new DashboardLoadError(cause.reason, cause))
    );
  });

const licenseSyncEffect = (fetchImpl: DashboardFetch) =>
  Effect.tryPromise({
    try: () => fetchImpl('/api/telemetry/sync-license', { method: 'POST' }),
    catch: cause => new TelemetryLoadError('License sync request failed', cause),
  }).pipe(
    Effect.flatMap(response =>
      response.ok ? Effect.void : Effect.fail(new TelemetryLoadError('License sync was rejected'))
    )
  );

const loadTelemetryPipeline = (fetchImpl: DashboardFetch) =>
  Effect.gen(function* () {
    yield* licenseSyncEffect(fetchImpl);

    const response = yield* Effect.tryPromise({
      try: () => fetchImpl(`/api/telemetry/dashboard?_=${Date.now()}`),
      catch: cause => new TelemetryLoadError('Network request failed', cause),
    });
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause => new TelemetryLoadError('Invalid JSON payload', cause),
    });
    if (!response.ok) {
      yield* Effect.fail(
        new TelemetryLoadError(parseApiError(payload, 'Failed to load telemetry data'))
      );
    }
    return yield* parseTelemetryDashboard(payload).pipe(
      Effect.mapError(cause => new TelemetryLoadError(cause.reason, cause))
    );
  });

/**
 * Provision a Worker license for a Better Auth session when present.
 * OTP-only visitors receive 401; that is expected and ignored.
 * Worker provision is idempotent for existing customers.
 *
 * @param fetchImpl - Boundary fetch used to call `/api/provision-license`.
 * @returns Always succeeds so dashboard load is not blocked.
 */
export function provisionSignedInLicense(fetchImpl: DashboardFetch): Effect.Effect<void> {
  return Effect.tryPromise({
    try: () => fetchImpl('/api/provision-license', { method: 'POST' }),
    catch: cause => new DashboardLoadError('License provision request failed', cause),
  }).pipe(
    Effect.zipRight(Effect.void),
    Effect.catchAll(() => Effect.void)
  );
}

/**
 * Mint a Worker admin session when the browser does not already have one.
 *
 * @param fetchImpl - Boundary fetch used to call `/api/admin/auth-bridge`.
 * @param storage - Browser storage that holds `omg_session_token`.
 * @returns Void on success, or `AdminAuthSyncError`.
 */
export function syncAdminAuth(
  fetchImpl: DashboardFetch,
  storage: SessionTokenStorage
): Effect.Effect<void, AdminAuthSyncError> {
  const existingToken = storage.getItem(SESSION_TOKEN_KEY);
  if (existingToken !== null && existingToken.length > 0) {
    return Effect.void;
  }

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchImpl('/api/admin/auth-bridge'),
      catch: cause => new AdminAuthSyncError('Admin auth bridge request failed', cause),
    });
    if (!response.ok) {
      yield* Effect.fail(new AdminAuthSyncError('Admin auth bridge rejected the request'));
    }
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause => new AdminAuthSyncError('Admin auth bridge returned invalid JSON', cause),
    });
    const session = yield* decodeAdminSessionClientResponse(payload).pipe(
      Effect.mapError(cause => new AdminAuthSyncError(cause.reason, cause))
    );
    storage.setItem(SESSION_TOKEN_KEY, session.token);
  });
}

/** The reactive view state backing the account dashboard page. */
export interface DashboardView {
  dashboardData: Accessor<DashboardData | null>;
  telemetryData: Accessor<TelemetryDashboard | null>;
  loading: Accessor<boolean>;
  error: Accessor<string>;
  setError: (message: string) => void;
  telemetryLoading: Accessor<boolean>;
  telemetryError: Accessor<string>;
  adminAuthError: Accessor<string>;
  loadAll: () => void;
  loadTelemetry: () => void;
}

/**
 * Create the dashboard view model: runs the fetch + decode pipelines and
 * grounds the results into Solid signals consumed by the page.
 *
 * @param fetchImpl - Optional fetch seam for tests. Defaults to global fetch.
 * @param storage - Optional storage seam for tests. Defaults to `window.localStorage` on sync.
 */
export function createDashboardView(
  fetchImpl?: DashboardFetch,
  storage?: SessionTokenStorage
): DashboardView {
  const [dashboardData, setDashboardData] = createSignal<DashboardData | null>(null);
  const [telemetryData, setTelemetryData] = createSignal<TelemetryDashboard | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [telemetryLoading, setTelemetryLoading] = createSignal(true);
  const [telemetryError, setTelemetryError] = createSignal('');
  const [adminAuthError, setAdminAuthError] = createSignal('');

  const doFetch: DashboardFetch = fetchImpl ?? ((input, init) => fetch(input, init));

  const runAdminAuthSync = (): void => {
    const tokenStore = storage ?? window.localStorage;
    const owned = Effect.runPromiseExit(syncAdminAuth(doFetch, tokenStore)).then(exit => {
      Exit.match(exit, {
        onSuccess: () => {
          setAdminAuthError('');
        },
        onFailure: cause => {
          const failure = Cause.failureOption(cause);
          const message = Option.isSome(failure)
            ? failure.value.message
            : 'Failed to sync admin session';
          setAdminAuthError(message);
        },
      });
    });
    void owned;
  };

  const loadDashboard = (): void => {
    setLoading(true);
    setError('');
    const owned = Effect.runPromiseExit(loadDashboardPipeline(doFetch)).then(exit => {
      setLoading(false);
      Exit.match(exit, {
        onSuccess: data => {
          setDashboardData(data);
          setError('');
        },
        onFailure: () => {
          setDashboardData(null);
          setError('Failed to load dashboard data');
        },
      });
    });
    void owned;
  };

  const loadTelemetry = (): void => {
    setTelemetryLoading(true);
    setTelemetryError('');
    const owned = Effect.runPromiseExit(loadTelemetryPipeline(doFetch)).then(exit => {
      setTelemetryLoading(false);
      Exit.match(exit, {
        onSuccess: data => {
          setTelemetryData(data);
          setTelemetryError('');
          if (data.user.role === 'admin') {
            runAdminAuthSync();
          }
        },
        onFailure: cause => {
          setTelemetryData(null);
          const failure = Cause.failureOption(cause);
          setTelemetryError(
            Option.isSome(failure) && failure.value instanceof TelemetryLoadError
              ? failure.value.message
              : 'Failed to load telemetry data'
          );
        },
      });
    });
    void owned;
  };

  const loadAll = (): void => {
    const owned = Effect.runPromiseExit(provisionSignedInLicense(doFetch));
    void owned;
    loadDashboard();
    loadTelemetry();
  };

  return {
    dashboardData,
    telemetryData,
    loading,
    error,
    setError,
    telemetryLoading,
    telemetryError,
    adminAuthError,
    loadAll,
    loadTelemetry,
  };
}
