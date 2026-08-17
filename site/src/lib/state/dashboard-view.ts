import { Effect } from 'effect';
import { createSignal, type Accessor } from 'solid-js';
import { decodeDashboardData, type DashboardData } from '~/lib/contracts/dashboard';
import {
  decodeTelemetryDashboard,
  type TelemetryDashboard,
} from '~/lib/contracts/telemetry-dashboard';
import { parseApiError, parseSessionToken } from '~/lib/dashboard-contract';

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

const loadDashboardPipeline = Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: () => fetch('/api/dashboard'),
    catch: cause => new DashboardLoadError('Network request failed', cause),
  });
  if (!response.ok) {
    yield* Effect.fail(new DashboardLoadError('Failed to load dashboard data'));
  }
  const payload = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: cause => new DashboardLoadError('Invalid JSON payload', cause),
  });
  return yield* Effect.fromNullable(decodeDashboardData(payload)).pipe(
    Effect.mapError(() => new DashboardLoadError('Dashboard response has an invalid shape'))
  );
});

/** Best-effort license sync; failures are surfaced to the console only. */
const licenseSyncEffect = Effect.tryPromise({
  try: () => fetch('/api/telemetry/sync-license', { method: 'POST' }),
  catch: cause => new TelemetryLoadError('License sync request failed', cause),
}).pipe(
  Effect.catchAll(cause =>
    Effect.sync(() => console.error('[Dashboard] License sync failed:', cause))
  )
);

const loadTelemetryPipeline = Effect.gen(function* () {
  yield* licenseSyncEffect;

  const response = yield* Effect.tryPromise({
    try: () => fetch(`/api/telemetry/dashboard?_=${Date.now()}`),
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
  return yield* Effect.fromNullable(decodeTelemetryDashboard(payload)).pipe(
    Effect.mapError(() => new TelemetryLoadError('Telemetry response has an invalid shape'))
  );
});

/**
 * Best-effort admin bridge token sync; skipped when a token already exists.
 * Failures are surfaced to the console only.
 */
function syncAdminAuth(): void {
  const existingToken = window.localStorage.getItem('omg_session_token');
  if (existingToken) return;

  const pipeline = Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch('/api/admin/auth-bridge'),
      catch: cause => new DashboardLoadError('Admin auth bridge request failed', cause),
    });
    if (!response.ok) {
      yield* Effect.fail(new DashboardLoadError('Admin auth bridge rejected the request'));
    }
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause => new DashboardLoadError('Admin auth bridge returned invalid JSON', cause),
    });
    const parsed = parseSessionToken(payload);
    return yield* parsed.ok
      ? Effect.succeed(parsed.value)
      : Effect.fail(new DashboardLoadError(parsed.error));
  }).pipe(
    Effect.tap(token => Effect.sync(() => window.localStorage.setItem('omg_session_token', token)))
  );

  Effect.runPromise(pipeline).catch(error => {
    console.error('[Dashboard] Admin auth sync error:', error);
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
  loadAll: () => void;
  loadTelemetry: () => void;
}

/**
 * Create the dashboard view model: runs the fetch + decode pipelines and
 * grounds the results into Solid signals consumed by the page.
 */
export function createDashboardView(): DashboardView {
  const [dashboardData, setDashboardData] = createSignal<DashboardData | null>(null);
  const [telemetryData, setTelemetryData] = createSignal<TelemetryDashboard | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [telemetryLoading, setTelemetryLoading] = createSignal(true);
  const [telemetryError, setTelemetryError] = createSignal('');

  const loadDashboard = (): void => {
    setLoading(true);
    setError('');
    Effect.runPromise(loadDashboardPipeline)
      .then(
        data => {
          setDashboardData(data);
          setError('');
        },
        () => {
          setDashboardData(null);
          setError('Failed to load dashboard data');
        }
      )
      .finally(() => setLoading(false));
  };

  const loadTelemetry = (): void => {
    setTelemetryLoading(true);
    setTelemetryError('');
    Effect.runPromise(loadTelemetryPipeline)
      .then(
        data => {
          setTelemetryData(data);
          setTelemetryError('');
          if (data.user.role === 'admin') {
            syncAdminAuth();
          }
        },
        cause => {
          setTelemetryData(null);
          setTelemetryError(
            cause instanceof TelemetryLoadError ? cause.message : 'Failed to load telemetry data'
          );
        }
      )
      .finally(() => setTelemetryLoading(false));
  };

  const loadAll = (): void => {
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
    loadAll,
    loadTelemetry,
  };
}
