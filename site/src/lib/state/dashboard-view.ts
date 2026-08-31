import { Cause, Effect, Exit, Option } from 'effect';
import { createSignal, type Accessor } from 'solid-js';
import { parseAccountDashboard, type DashboardData } from '~/lib/contracts/account-dashboard';
import type { TelemetryDashboard } from '~/lib/contracts/telemetry-dashboard';
import { parseLicensingDashboard } from '~/lib/contracts/licensing-dashboard';
import { LicensingRoutes } from '../../../../shared/licensing-routes';
import { parseApiError } from '~/lib/dashboard-contract';

/** A failure while loading or decoding the account dashboard. */
class DashboardLoadError extends Error {
  readonly _tag = 'DashboardLoadError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** A failure while loading or decoding the telemetry dashboard. */
class TelemetryLoadError extends Error {
  readonly _tag = 'TelemetryLoadError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const LICENSING_DASHBOARD_PATH = `/api/licensing${LicensingRoutes.dashboard.path}`;

/** A fetch function used by the dashboard view-model. */
export type DashboardFetch = (input: string) => Promise<Response>;

function browserDashboardFetch(input: string): Promise<Response> {
  switch (input) {
    case '/api/dashboard':
      return fetch('/api/dashboard');
    case LICENSING_DASHBOARD_PATH:
      return fetch(LICENSING_DASHBOARD_PATH);
    default:
      return Promise.reject(new DashboardLoadError('Dashboard route is not allowed'));
  }
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

const loadTelemetryPipeline = (fetchImpl: DashboardFetch) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchImpl(LICENSING_DASHBOARD_PATH),
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
    return yield* parseLicensingDashboard(payload).pipe(
      Effect.mapError(cause => new TelemetryLoadError(cause.reason, cause))
    );
  });

/** The reactive view state backing the account dashboard page. */
interface DashboardView {
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
 *
 * @param fetchImpl - Optional fetch seam for tests. Defaults to global fetch.
 */
export function createDashboardView(fetchImpl?: DashboardFetch): DashboardView {
  const [dashboardData, setDashboardData] = createSignal<DashboardData | null>(null);
  const [telemetryData, setTelemetryData] = createSignal<TelemetryDashboard | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [telemetryLoading, setTelemetryLoading] = createSignal(true);
  const [telemetryError, setTelemetryError] = createSignal('');

  const doFetch: DashboardFetch = fetchImpl ?? browserDashboardFetch;

  // Generation guards: a slow response from an earlier load must never
  // clobber state produced by a newer one.
  let dashboardLoadId = 0;
  let telemetryLoadId = 0;

  const loadDashboard = (): void => {
    const loadId = ++dashboardLoadId;
    setLoading(true);
    setError('');
    const owned = Effect.runPromiseExit(loadDashboardPipeline(doFetch)).then(exit => {
      if (loadId !== dashboardLoadId) {
        return;
      }
      setLoading(false);
      Exit.match(exit, {
        onSuccess: data => {
          setDashboardData(data);
          setError('');
        },
        onFailure: cause => {
          setDashboardData(null);
          const failure = Cause.failureOption(cause);
          setError(
            Option.isSome(failure) && failure.value instanceof DashboardLoadError
              ? failure.value.message
              : 'Failed to load dashboard data'
          );
        },
      });
    });
    void owned;
  };

  const loadTelemetry = (): void => {
    const loadId = ++telemetryLoadId;
    setTelemetryLoading(true);
    setTelemetryError('');
    const owned = Effect.runPromiseExit(loadTelemetryPipeline(doFetch)).then(exit => {
      if (loadId !== telemetryLoadId) {
        return;
      }
      setTelemetryLoading(false);
      Exit.match(exit, {
        onSuccess: data => {
          setTelemetryData(data);
          setTelemetryError('');
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
