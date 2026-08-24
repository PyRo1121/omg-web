import { reportClientError } from '~/lib/observability';
import {
  type Component,
  createSignal,
  onMount,
  lazy,
  Show,
  For,
  Suspense,
  createMemo,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useNavigate } from '@solidjs/router';
import {
  Monitor,
  LogOut,
  Shield,
  Clock,
  CircleCheckBig,
  Terminal,
  Package,
  Zap,
  Activity,
  Award,
  ChartColumn,
  CircleAlert,
  TrendingUp,
  Sparkles,
  Copy,
  Check,
  Download,
  Calendar,
  RefreshCw,
  Users,
} from 'lucide-solid';
import { signOutBrowserSessions } from '~/lib/auth-client';
import { createDashboardView } from '~/lib/state/dashboard-view';
import {
  countActiveMachines,
  countUnlockedAchievements,
  createTelemetryExport,
  DASHBOARD_DATE_RANGES,
  formatDashboardDate,
  formatDashboardShortDate,
  formatDashboardTimeSaved,
  formatMachineId,
  formatMachineVersion,
  formatTrendPercentage,
  getAchievementIcon,
  getAverageCommandsPerDay,
  getCommandBarHeight,
  getDashboardTabs,
  getMachineDisplayName,
  getPackageBarHeight,
  getPeakDay,
  getProviderIcon,
  getRecentDailyUsage,
  getSessionBrowser,
  getSessionLocation,
  getTotalPackages,
  getTrendPresentation,
  type DashboardDateRange,
  type DashboardTab,
} from '~/lib/dashboard-page';

// Lazily split so the entire admin surface stays out of non-admin users'
// bundles; it is only rendered for admins on the 'admin' tab.
const AdminDashboard = lazy(() => import('~/components/dashboard/AdminDashboard'));

/**
 * Only the Better Auth user projection this page renders. Session secrets
 * (token, IP, agent) are deliberately not part of the consumed contract.
 */
interface DashboardPageProps {
  session: {
    user: {
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
      image?: string | null | undefined;
    };
  };
}

const DashboardPage: Component<DashboardPageProps> = props => {
  const navigate = useNavigate();
  const {
    dashboardData,
    telemetryData,
    loading,
    error,
    setError,
    telemetryLoading,
    telemetryError,
    loadAll,
    loadTelemetry,
  } = createDashboardView();
  const [copiedLicense, setCopiedLicense] = createSignal(false);
  const [dateRange, setDateRange] = createSignal<DashboardDateRange>('30d');
  const [activeTab, setActiveTab] = createSignal<DashboardTab>('overview');
  // onMount only runs on the client (deferred until hydration completes during
  // SSR), so this flag is the observable signal that event handlers are live.
  const [isInteractive, setIsInteractive] = createSignal(false);

  onMount(() => {
    setIsInteractive(true);
    loadAll();
  });

  const handleSignOut = async (): Promise<void> => {
    const result = await signOutBrowserSessions();
    if (result.failures.length > 0) {
      reportClientError(
        'Sign out incomplete:',
        result.failures.map(failure => failure._tag).join(', ')
      );
      setError('Failed to revoke all active browser sessions');
      return;
    }
    navigate('/', { replace: true });
  };

  const copyLicenseKey = async () => {
    const key = telemetryData()?.license.license_key;
    if (key) {
      await navigator.clipboard.writeText(key);
      setCopiedLicense(true);
      setTimeout(() => setCopiedLicense(false), 2000);
    }
  };

  const exportData = (format: 'csv' | 'json') => {
    const data = telemetryData();
    if (!data) {
      return;
    }

    const telemetryExport = createTelemetryExport(data, format, new Date());
    const blob = new Blob([telemetryExport.content], { type: telemetryExport.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = telemetryExport.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimeSaved = createMemo(() =>
    formatDashboardTimeSaved(telemetryData()?.usage.total_time_saved_ms || 0)
  );

  const averageCommandsPerDay = createMemo(() =>
    getAverageCommandsPerDay(telemetryData()?.daily ?? [])
  );

  const peakDay = createMemo(() => getPeakDay(telemetryData()?.daily ?? []));

  const recentDailyUsage = createMemo(() => getRecentDailyUsage(telemetryData()?.daily ?? []));

  const totalPackages = createMemo(() => getTotalPackages(telemetryData()?.usage));

  const pageBg = 'min-h-screen overflow-x-hidden bg-[var(--paper)] text-[var(--ink)]';

  const glassPanel = 'rounded-2xl border border-[var(--rule)] bg-white/[0.025]';

  const tabs = createMemo(() => getDashboardTabs(telemetryData()?.user?.role));

  // Tailwind v4 extracts classes statically: color names must map to full
  // literal class strings, never template interpolation.
  const statColorClasses = {
    emerald: { icon: 'text-emerald-700' },
    indigo: { icon: 'text-[var(--signal)]' },
    purple: { icon: 'text-[var(--signal)]' },
    cyan: { icon: 'text-[var(--signal)]' },
    amber: { icon: 'text-amber-700' },
    red: { icon: 'text-red-700' },
  } satisfies Record<string, { icon: string }>;

  type StatColor = keyof typeof statColorClasses;
  const StatCard = (cardProps: {
    title: string;
    value: string;
    icon: Component<{ class?: string; strokeWidth?: number }>;
    color: StatColor;
    sub?: string;
    trend?: number | undefined;
  }) => {
    const colorClasses = statColorClasses[cardProps.color];
    const trendIcon = getTrendPresentation(cardProps.trend).icon;
    const trendColor = () => getTrendPresentation(cardProps.trend).color;

    return (
      <section class="group border-t border-[var(--rule)] py-5 first:border-t-0">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <cardProps.icon class={`h-4 w-4 ${colorClasses.icon}`} strokeWidth={1.5} />
            <h3 class="manifest-label text-[var(--ink-muted)]">{cardProps.title}</h3>
          </div>
          <Show when={cardProps.trend !== undefined}>
            <div class={`flex items-center gap-1 font-mono text-xs font-medium ${trendColor()}`}>
              <Dynamic component={trendIcon} class="h-3.5 w-3.5" />
              <span>{formatTrendPercentage(cardProps.trend)}%</span>
            </div>
          </Show>
        </div>
        <data class="mt-5 block text-4xl font-semibold tracking-[-0.055em]">{cardProps.value}</data>
        <Show when={cardProps.sub}>
          <p class="mt-1 text-xs text-[var(--ink-muted)]">{cardProps.sub}</p>
        </Show>
      </section>
    );
  };

  return (
    <div class={pageBg} data-ui="manifest-dashboard">
      <div class="min-h-screen">
        <div class="manifest-shell py-8 sm:py-12">
          <header class="grid border-b border-[var(--rule)] pb-8 sm:grid-cols-[1fr_auto]">
            <div class="flex items-start justify-between gap-6 sm:contents">
              <div>
                <p class="font-mono text-xs text-[var(--signal)]">Account overview</p>
                <h1 class="mt-4 text-5xl font-medium tracking-[-0.06em] sm:text-7xl">
                  Your workspace
                </h1>
                <p class="mt-3 font-mono text-xs text-[var(--ink-muted)]">
                  Signed in as {props.session.user.name}
                </p>
              </div>
              <div class="flex items-start gap-2">
                <Show when={!telemetryLoading() && telemetryData()}>
                  <button
                    type="button"
                    onClick={loadTelemetry}
                    class="btn-secondary px-3 py-2 text-sm"
                    title="Refresh data"
                  >
                    <RefreshCw class="h-4 w-4" />
                  </button>
                </Show>
                {/* Disabled until hydration so a click can never be silently
                    dropped before Solid attaches the delegated listener. */}
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={!isInteractive()}
                  class="btn-secondary px-4 py-2 text-sm"
                >
                  <LogOut class="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </header>

          <div class="sticky top-0 z-20 border-b border-[var(--rule)] bg-[rgba(8,11,9,0.9)] backdrop-blur-xl">
            <div>
              <nav
                class="no-scrollbar flex overflow-x-auto"
                role="tablist"
                aria-label="Workspace sections"
              >
                <For each={tabs()}>
                  {tab => (
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      class={`manifest-label relative flex items-center gap-2 border-r border-[var(--rule)] px-5 py-4 whitespace-nowrap ${
                        activeTab() === tab.id
                          ? 'bg-[var(--signal)] text-[var(--signal-ink)]'
                          : 'text-[var(--ink-muted)] hover:bg-white/[0.05] hover:text-[var(--ink)]'
                      }`}
                      role="tab"
                      aria-selected={activeTab() === tab.id}
                    >
                      <tab.icon class="h-4 w-4" />
                      <span>{tab.label}</span>
                    </button>
                  )}
                </For>
              </nav>
            </div>
          </div>

          <main class="py-8 sm:py-12">
            <Show when={loading() || telemetryLoading()}>
              <div class="animate-pulse space-y-6">
                <div class="grid gap-6 lg:grid-cols-3">
                  <div class={`${glassPanel} h-48 p-6`}>
                    <div class="h-16 w-16 rounded-full bg-slate-700/50" />
                  </div>
                  <div class={`${glassPanel} h-48 p-6 lg:col-span-2`} />
                </div>
                <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <For each={[1, 2, 3, 4]}>
                    {() => (
                      <div class={`${glassPanel} h-32 p-6`}>
                        <div class="h-12 w-12 rounded-xl bg-slate-700/50" />
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={error()}>
              <div class={`${glassPanel} mb-6 p-6 text-center`}>
                <p class="text-red-400">{error()}</p>
              </div>
            </Show>

            <Show when={telemetryError()}>
              <div class={`${glassPanel} mb-6 p-6`}>
                <div class="flex items-start gap-3">
                  <CircleAlert class="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" />
                  <div>
                    <h3 class="mb-2 font-medium text-white">Telemetry Data Unavailable</h3>
                    <p class="mb-3 text-sm text-slate-400">{telemetryError()}</p>
                    <p class="text-xs text-slate-500">
                      Your account is set up, but telemetry data couldn't be loaded. This might be
                      because you haven't used the OMG CLI yet or there's a connection issue.
                    </p>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={!loading() && dashboardData() && activeTab() === 'overview'}>
              <div class="animate-fade-in-up space-y-6">
                <div class="grid gap-6 lg:grid-cols-3">
                  <div class={`${glassPanel} p-6 lg:col-span-1`}>
                    <div class="flex items-start gap-4">
                      <Show
                        when={props.session.user.image}
                        fallback={
                          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl font-bold text-white">
                            {props.session.user.name.charAt(0).toUpperCase()}
                          </div>
                        }
                      >
                        <img
                          src={props.session.user.image ?? undefined}
                          alt={props.session.user.name}
                          class="h-16 w-16 rounded-full border-2 border-white/10"
                        />
                      </Show>
                      <div class="flex-1">
                        <h2 class="text-xl font-bold text-white">{props.session.user.name}</h2>
                        <p class="text-sm text-slate-400">{props.session.user.email}</p>
                      </div>
                    </div>

                    <Show when={telemetryData()?.license}>
                      {license => (
                        <div class="mt-6 border-t border-white/10 pt-6">
                          <h3 class="mb-4 text-sm font-medium text-slate-400">License</h3>
                          <div class="rounded-lg border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-4">
                            <div class="mb-3 flex items-center gap-2">
                              <Award class="h-5 w-5 text-yellow-400" />
                              <span class="font-bold text-white uppercase">{license().tier}</span>
                            </div>
                            <div class="mb-2 flex items-center justify-between gap-2">
                              <p class="flex-1 truncate font-mono text-xs text-slate-400">
                                {license().license_key}
                              </p>
                              <button
                                type="button"
                                onClick={copyLicenseKey}
                                class="rounded-lg p-2 transition-colors hover:bg-white/10"
                                title="Copy license key"
                              >
                                <Show
                                  when={copiedLicense()}
                                  fallback={<Copy class="h-3.5 w-3.5 text-slate-400" />}
                                >
                                  <Check class="h-3.5 w-3.5 text-emerald-400" />
                                </Show>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </Show>
                  </div>

                  <div class={`${glassPanel} p-6 lg:col-span-2`}>
                    <h3 class="gradient-text mb-4 text-lg font-bold">Quick Stats</h3>
                    <Show when={telemetryLoading() ? undefined : telemetryData()}>
                      {data => (
                        <div class="grid grid-cols-2 gap-4">
                          <StatCard
                            title="Time Saved"
                            value={formatTimeSaved()}
                            icon={Clock}
                            color="emerald"
                            sub="Total productivity gains"
                          />
                          <StatCard
                            title="Commands Run"
                            value={data().usage.total_commands.toLocaleString()}
                            icon={Terminal}
                            color="indigo"
                            sub="Total executions"
                          />
                          <StatCard
                            title="Packages"
                            value={totalPackages().toLocaleString()}
                            icon={Package}
                            color="purple"
                            sub="Installs + searches"
                          />
                          <StatCard
                            title="Active Machines"
                            value={countActiveMachines(data().machines).toString()}
                            icon={Monitor}
                            color="cyan"
                            sub={`${data().machines.length} total`}
                          />
                        </div>
                      )}
                    </Show>
                  </div>
                </div>

                <Show
                  when={!telemetryLoading() && (telemetryData()?.usage.total_commands ?? 0) > 0}
                >
                  <div class={`${glassPanel} p-6`}>
                    <h3 class="mb-4 flex items-center gap-2 text-lg font-bold">
                      <Sparkles class="h-5 w-5 text-yellow-400" />
                      <span class="gradient-text">Key Insights</span>
                    </h3>
                    <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
                      <div>
                        <div class="mb-1 text-sm text-slate-400">Daily Average</div>
                        <div class="text-2xl font-bold text-white">{averageCommandsPerDay()}</div>
                        <div class="mt-1 text-xs text-slate-500">commands per day</div>
                      </div>
                      <Show when={peakDay()}>
                        {day => (
                          <div>
                            <div class="mb-1 text-sm text-slate-400">Peak Productivity</div>
                            <div class="text-2xl font-bold text-white">{day().commands_run}</div>
                            <div class="mt-1 text-xs text-slate-500">
                              on {formatDashboardShortDate(day().date)}
                            </div>
                          </div>
                        )}
                      </Show>
                      <div>
                        <div class="mb-1 text-sm text-slate-400">Total Packages</div>
                        <div class="text-2xl font-bold text-white">
                          {totalPackages().toLocaleString()}
                        </div>
                        <div class="mt-1 text-xs text-slate-500">installs + searches</div>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={telemetryLoading() ? undefined : telemetryData()}>
                  {data => (
                    <Show when={data().daily.length > 0}>
                      <div class={`${glassPanel} p-6`}>
                        <h3 class="mb-6 flex items-center gap-2 text-lg font-bold">
                          <Activity class="h-5 w-5 text-indigo-400" />
                          <span class="gradient-text">Recent Activity (7 Days)</span>
                        </h3>
                        <div class="flex h-48 items-end justify-between gap-2">
                          <For each={recentDailyUsage()}>
                            {day => {
                              const commandsHeight = getCommandBarHeight(day, recentDailyUsage());
                              return (
                                <div class="group flex flex-1 flex-col items-center gap-2">
                                  <div
                                    class="w-full"
                                    style={{
                                      height: '160px',
                                      display: 'flex',
                                      'align-items': 'flex-end',
                                    }}
                                  >
                                    <div
                                      class="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all group-hover:from-indigo-500 group-hover:to-indigo-300"
                                      style={{
                                        height: `${commandsHeight}%`,
                                        'min-height': '4px',
                                      }}
                                      title={`${day.commands_run} commands`}
                                    />
                                  </div>
                                  <span class="text-xs text-slate-500">
                                    {formatDashboardShortDate(day.date)}
                                  </span>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    </Show>
                  )}
                </Show>
              </div>
            </Show>

            <Show when={!loading() && activeTab() === 'analytics'}>
              <div class="animate-fade-in-up space-y-6">
                <div class="mb-4 flex items-center justify-between">
                  <h2 class="gradient-text text-2xl font-bold">Detailed Analytics</h2>
                  <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2 text-sm text-slate-400">
                      <Calendar class="h-4 w-4" />
                      <span>Time Range</span>
                    </div>
                    <div class="flex gap-2">
                      <For each={DASHBOARD_DATE_RANGES}>
                        {option => (
                          <button
                            type="button"
                            onClick={() => setDateRange(option.value)}
                            class={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                              dateRange() === option.value
                                ? 'border border-indigo-500/30 bg-indigo-500/20 text-indigo-400'
                                : 'border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {option.label}
                          </button>
                        )}
                      </For>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => exportData('csv')}
                        class="btn-secondary px-3 py-2 text-sm"
                        title="Export as CSV"
                      >
                        <Download class="h-4 w-4" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => exportData('json')}
                        class="btn-secondary px-3 py-2 text-sm"
                        title="Export as JSON"
                      >
                        <Download class="h-4 w-4" />
                        JSON
                      </button>
                    </div>
                  </div>
                </div>

                <Show when={telemetryLoading() ? undefined : telemetryData()}>
                  {data => (
                    <>
                      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                          title="Time Saved"
                          value={formatTimeSaved()}
                          icon={Clock}
                          color="emerald"
                          sub="Productivity gains"
                          trend={data().usage.time_saved_trend}
                        />
                        <StatCard
                          title="Commands Run"
                          value={data().usage.total_commands.toLocaleString()}
                          icon={Terminal}
                          color="indigo"
                          sub="Total executions"
                          trend={data().usage.commands_trend}
                        />
                        <StatCard
                          title="Packages Installed"
                          value={data().usage.total_packages_installed.toLocaleString()}
                          icon={Package}
                          color="purple"
                          sub="Managed packages"
                        />
                        <StatCard
                          title="Runtime Switches"
                          value={data().usage.total_runtimes_switched.toLocaleString()}
                          icon={Zap}
                          color="amber"
                          sub="Version changes"
                        />
                      </div>

                      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                          title="SBOM Generated"
                          value={data().usage.total_sbom_generated.toLocaleString()}
                          icon={Shield}
                          color="indigo"
                          sub="Security scans"
                        />
                        <StatCard
                          title="Vulnerabilities"
                          value={data().usage.total_vulnerabilities_found.toLocaleString()}
                          icon={CircleAlert}
                          color="red"
                          sub="Security issues found"
                        />
                        <StatCard
                          title="Packages Searched"
                          value={data().usage.total_packages_searched.toLocaleString()}
                          icon={ChartColumn}
                          color="cyan"
                          sub="Search queries"
                        />
                        <StatCard
                          title="Active Machines"
                          value={countActiveMachines(data().machines).toString()}
                          icon={Monitor}
                          color="cyan"
                          sub={`${data().machines.length}/${data().license.max_machines} total`}
                        />
                      </div>

                      <Show
                        when={data().daily.length > 0}
                        fallback={
                          <div class={`${glassPanel} p-12 text-center`}>
                            <Activity class="mx-auto mb-4 h-12 w-12 text-slate-600" />
                            <h3 class="mb-2 text-lg font-bold text-white">No Activity Data Yet</h3>
                            <p class="mx-auto mb-6 max-w-md text-sm text-slate-400">
                              Start using the OMG CLI to see your activity trends and usage
                              patterns.
                            </p>
                          </div>
                        }
                      >
                        <div class={`${glassPanel} p-6`}>
                          <h3 class="mb-6 flex items-center gap-2 text-lg font-bold">
                            <Activity class="h-5 w-5 text-indigo-400" />
                            <span class="gradient-text">Activity Trends ({dateRange()})</span>
                          </h3>
                          <div class="flex h-64 items-end justify-between gap-2">
                            <For each={data().daily}>
                              {day => {
                                const commandsHeight = getCommandBarHeight(day, data().daily);
                                const packagesHeight = getPackageBarHeight(day, data().daily);
                                return (
                                  <div class="group flex flex-1 flex-col items-center gap-2">
                                    <div
                                      class="flex w-full items-end gap-1"
                                      style={{ height: '200px' }}
                                    >
                                      <div
                                        class="flex-1 rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all group-hover:from-indigo-500 group-hover:to-indigo-300"
                                        style={{
                                          height: `${commandsHeight}%`,
                                          'min-height': '4px',
                                        }}
                                        title={`${day.commands_run} commands`}
                                      />
                                      <div
                                        class="flex-1 rounded-t-lg bg-gradient-to-t from-purple-600 to-purple-400 transition-all group-hover:from-purple-500 group-hover:to-purple-300"
                                        style={{
                                          height: `${packagesHeight}%`,
                                          'min-height': '4px',
                                        }}
                                        title={`${day.packages_installed || 0} packages`}
                                      />
                                    </div>
                                    <span class="text-xs text-slate-500">
                                      {formatDashboardShortDate(day.date)}
                                    </span>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                          <div class="mt-4 flex items-center justify-center gap-6 border-t border-white/10 pt-4">
                            <div class="flex items-center gap-2">
                              <div class="h-3 w-3 rounded bg-gradient-to-br from-indigo-600 to-indigo-400" />
                              <span class="text-xs text-slate-400">Commands</span>
                            </div>
                            <div class="flex items-center gap-2">
                              <div class="h-3 w-3 rounded bg-gradient-to-br from-purple-600 to-purple-400" />
                              <span class="text-xs text-slate-400">Packages</span>
                            </div>
                          </div>
                        </div>
                      </Show>

                      <Show when={data().global_stats}>
                        {stats => (
                          <div class={`${glassPanel} p-6`}>
                            <h3 class="mb-6 flex items-center gap-2 text-lg font-bold">
                              <TrendingUp class="h-5 w-5 text-emerald-400" />
                              <span class="gradient-text">Global Stats</span>
                            </h3>
                            <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
                              <div>
                                <div class="mb-1 text-sm text-slate-400">Top Package</div>
                                <div class="text-xl font-bold text-white">
                                  {stats().top_package}
                                </div>
                              </div>
                              <div>
                                <div class="mb-1 text-sm text-slate-400">Top Runtime</div>
                                <div class="text-xl font-bold text-white">
                                  {stats().top_runtime}
                                </div>
                              </div>
                              <div>
                                <div class="mb-1 text-sm text-slate-400">Your Percentile</div>
                                <div class="text-xl font-bold text-emerald-400">
                                  Top {stats().percentile}%
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Show>
                    </>
                  )}
                </Show>
              </div>
            </Show>

            <Show when={!loading() && activeTab() === 'achievements'}>
              <div class="animate-fade-in-up space-y-6">
                <div class="mb-4 flex items-center justify-between">
                  <h2 class="gradient-text text-2xl font-bold">Achievements</h2>
                  <Show when={telemetryLoading() ? undefined : telemetryData()}>
                    {data => (
                      <div class="text-sm text-slate-400">
                        <span class="font-bold text-white">
                          {countUnlockedAchievements(data().achievements)}
                        </span>
                        {' / '}
                        <span>{data().achievements.length}</span>
                        {' unlocked'}
                      </div>
                    )}
                  </Show>
                </div>

                <Show when={telemetryLoading() ? undefined : telemetryData()}>
                  {data => (
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <For each={data().achievements}>
                        {achievement => {
                          const Icon = getAchievementIcon(achievement.icon, achievement.name);
                          return (
                            <div
                              class={`rounded-xl border p-6 transition-all hover:scale-[1.02] ${
                                achievement.unlocked
                                  ? 'border-yellow-500/30 bg-yellow-500/10 shadow-lg shadow-yellow-500/10'
                                  : 'border-white/10 bg-white/5'
                              }`}
                            >
                              <div class="mb-3 flex items-start gap-3">
                                <div
                                  class={`rounded-lg p-3 ${achievement.unlocked ? 'bg-yellow-500/20' : 'bg-white/5'}`}
                                >
                                  <Icon
                                    class={`h-6 w-6 ${
                                      achievement.unlocked ? 'text-yellow-400' : 'text-slate-600'
                                    }`}
                                  />
                                </div>
                                <div class="min-w-0 flex-1">
                                  <div class="mb-1 flex items-center gap-2 font-medium text-white">
                                    {achievement.name}
                                    <Show when={achievement.unlocked}>
                                      <CircleCheckBig class="h-4 w-4 flex-shrink-0 text-emerald-400" />
                                    </Show>
                                  </div>
                                  <div class="text-sm text-slate-400">
                                    {achievement.description}
                                  </div>
                                </div>
                              </div>
                              <Show
                                when={
                                  !achievement.unlocked &&
                                  achievement.progress &&
                                  achievement.progress > 0
                                }
                              >
                                <div class="mt-3">
                                  <div class="mb-1.5 flex items-center justify-between">
                                    <span class="text-xs text-slate-500">Progress</span>
                                    <span class="text-xs font-medium text-slate-400">
                                      {achievement.progress}%
                                    </span>
                                  </div>
                                  <div class="h-1.5 overflow-hidden rounded-full bg-white/5">
                                    <div
                                      class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                                      style={{ width: `${achievement.progress}%` }}
                                    />
                                  </div>
                                </div>
                              </Show>
                              <Show
                                when={achievement.unlocked ? achievement.unlocked_at : undefined}
                              >
                                {unlockedAt => (
                                  <div class="mt-3 text-xs text-slate-500">
                                    Unlocked {formatDashboardShortDate(unlockedAt())}
                                  </div>
                                )}
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  )}
                </Show>
              </div>
            </Show>

            <Show when={!loading() && activeTab() === 'machines'}>
              <div class="animate-fade-in-up space-y-6">
                <div class="mb-4 flex items-center justify-between">
                  <h2 class="gradient-text text-2xl font-bold">Machines</h2>
                  <Show when={telemetryLoading() ? undefined : telemetryData()}>
                    {data => (
                      <div class="text-sm text-slate-400">
                        <span class="font-bold text-white">
                          {countActiveMachines(data().machines)}
                        </span>
                        {' / '}
                        <span>{data().license.max_machines}</span>
                        {' active'}
                      </div>
                    )}
                  </Show>
                </div>

                <Show when={telemetryLoading() ? undefined : telemetryData()}>
                  {data => (
                    <Show
                      when={data().machines.length > 0}
                      fallback={
                        <div class={`${glassPanel} p-12 text-center`}>
                          <Monitor class="mx-auto mb-4 h-16 w-16 text-slate-600" />
                          <h3 class="mb-2 text-lg font-bold text-white">No Machines Registered</h3>
                          <p class="mx-auto mb-6 max-w-md text-sm text-slate-400">
                            Run the OMG CLI on your machine to register it and start tracking usage.
                          </p>
                          <div class="terminal mx-auto max-w-lg">
                            <div class="terminal-header">
                              <div class="terminal-dot red" />
                              <div class="terminal-dot yellow" />
                              <div class="terminal-dot green" />
                            </div>
                            <div class="terminal-body">
                              <div>
                                <span class="terminal-prompt">$ </span>
                                <span class="terminal-command">omg search firefox</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      }
                    >
                      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        <For each={data().machines}>
                          {machine => (
                            <div
                              class={`${glassPanel} p-6 transition-all hover:border-indigo-500/30`}
                            >
                              <div class="mb-4 flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                  <Monitor class="h-5 w-5 text-cyan-400" />
                                  <span class="font-medium text-white">
                                    {getMachineDisplayName(machine)}
                                  </span>
                                </div>
                                <Show when={machine.is_active}>
                                  <span class="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-1 text-xs text-green-400">
                                    <div class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                                    Active
                                  </span>
                                </Show>
                              </div>
                              <div class="space-y-2 text-sm">
                                <div class="flex items-center justify-between">
                                  <span class="text-slate-500">OS</span>
                                  <span class="text-slate-300">
                                    {machine.os} {machine.arch}
                                  </span>
                                </div>
                                <div class="flex items-center justify-between">
                                  <span class="text-slate-500">OMG Version</span>
                                  <span class="text-slate-300">
                                    {formatMachineVersion(machine.omg_version)}
                                  </span>
                                </div>
                                <div class="flex items-center justify-between">
                                  <span class="text-slate-500">Last Seen</span>
                                  <span class="text-slate-300">
                                    {formatDashboardShortDate(machine.last_seen_at)}
                                  </span>
                                </div>
                                <div class="flex items-center justify-between">
                                  <span class="text-slate-500">Machine ID</span>
                                  <span class="font-mono text-xs text-slate-300">
                                    {formatMachineId(machine.machine_id)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  )}
                </Show>
              </div>
            </Show>

            <Show
              when={!loading() && activeTab() === 'admin' && telemetryData()?.user.role === 'admin'}
            >
              <div class="animate-fade-in-up">
                <Suspense
                  fallback={
                    <div class={`${glassPanel} h-48 p-6`}>
                      <div class="h-12 w-12 animate-pulse rounded-full bg-slate-700/50" />
                    </div>
                  }
                >
                  <AdminDashboard />
                </Suspense>
              </div>
            </Show>

            <Show when={!loading() && dashboardData() && activeTab() === 'settings'}>
              <div class="animate-fade-in-up space-y-6">
                <h2 class="gradient-text mb-6 text-2xl font-bold">Settings</h2>

                <div class={`${glassPanel} p-6`}>
                  <h3 class="mb-4 flex items-center gap-2 text-lg font-bold">
                    <Users class="h-5 w-5 text-indigo-400" />
                    <span class="gradient-text">Connected Accounts</span>
                  </h3>
                  <div class="space-y-3">
                    <For each={dashboardData()?.accounts || []}>
                      {account => {
                        const Icon = getProviderIcon(account.provider);
                        return (
                          <div class="flex items-center gap-3 rounded-lg bg-white/5 p-4 transition-colors hover:bg-white/10">
                            <Icon class="h-5 w-5 text-slate-400" />
                            <div class="flex-1">
                              <p class="text-sm font-medium text-white capitalize">
                                {account.provider}
                              </p>
                              <p class="text-xs text-slate-500">{account.accountId}</p>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>

                <div class={`${glassPanel} p-6`}>
                  <h3 class="mb-4 flex items-center gap-2 text-lg font-bold">
                    <Monitor class="h-5 w-5 text-indigo-400" />
                    <span class="gradient-text">Active Sessions</span>
                  </h3>
                  <div class="space-y-3">
                    <For each={dashboardData()?.sessions || []}>
                      {session => (
                        <div
                          class={`rounded-lg border p-4 transition-colors ${
                            session.isCurrent
                              ? 'border-indigo-500/30 bg-indigo-500/5'
                              : 'border-white/10 bg-white/5'
                          }`}
                        >
                          <div class="flex items-start justify-between">
                            <div class="flex-1">
                              <div class="flex items-center gap-2">
                                <p class="font-medium text-white">
                                  {getSessionBrowser(session.userAgent)}
                                </p>
                                <Show when={session.isCurrent}>
                                  <span class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-400">
                                    Current
                                  </span>
                                </Show>
                              </div>
                              <p class="mt-1 text-sm text-slate-400">
                                {getSessionLocation(session.ipAddress)}
                              </p>
                              <div class="mt-2 flex gap-4 text-xs text-slate-500">
                                <span>Created: {formatDashboardDate(session.createdAt)}</span>
                                <span>Expires: {formatDashboardDate(session.expiresAt)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>

                <Show when={telemetryData()?.license}>
                  {license => (
                    <div class={`${glassPanel} p-6`}>
                      <h3 class="mb-4 flex items-center gap-2 text-lg font-bold">
                        <Award class="h-5 w-5 text-yellow-400" />
                        <span class="gradient-text">License Details</span>
                      </h3>
                      <div class="rounded-lg border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-6">
                        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div>
                            <div class="mb-2 text-sm text-slate-400">Tier</div>
                            <div class="text-2xl font-bold text-white uppercase">
                              {license().tier}
                            </div>
                          </div>
                          <div>
                            <div class="mb-2 text-sm text-slate-400">Status</div>
                            <div class="text-2xl font-bold text-emerald-400 capitalize">
                              {license().status}
                            </div>
                          </div>
                          <div>
                            <div class="mb-2 text-sm text-slate-400">Max Machines</div>
                            <div class="text-2xl font-bold text-white">
                              {license().max_machines}
                            </div>
                          </div>
                          <div>
                            <div class="mb-2 text-sm text-slate-400">License Key</div>
                            <div class="flex items-center gap-2">
                              <code class="rounded bg-black/30 px-3 py-1.5 font-mono text-sm text-slate-300">
                                {license().license_key}
                              </code>
                              <button
                                type="button"
                                onClick={copyLicenseKey}
                                class="rounded-lg p-2 transition-colors hover:bg-white/10"
                                title="Copy license key"
                              >
                                <Show
                                  when={copiedLicense()}
                                  fallback={<Copy class="h-4 w-4 text-slate-400" />}
                                >
                                  <Check class="h-4 w-4 text-emerald-400" />
                                </Show>
                              </button>
                            </div>
                          </div>
                        </div>
                        <div class="mt-6 border-t border-white/10 pt-6">
                          <div class="mb-3 text-sm text-slate-400">Enabled Features</div>
                          <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <For each={license().features}>
                              {feature => (
                                <div class="flex items-center gap-2">
                                  <CircleCheckBig class="h-4 w-4 text-emerald-400" />
                                  <span class="text-sm text-slate-300">{feature}</span>
                                </div>
                              )}
                            </For>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Show>

                <div class={`${glassPanel} p-6`}>
                  <h3 class="mb-4 flex items-center gap-2 text-lg font-bold">
                    <Download class="h-5 w-5 text-indigo-400" />
                    <span class="gradient-text">Export Data</span>
                  </h3>
                  <p class="mb-4 text-sm text-slate-400">
                    Download your telemetry data in CSV or JSON format for analysis or backup.
                  </p>
                  <div class="flex gap-3">
                    <button
                      type="button"
                      onClick={() => exportData('csv')}
                      class="btn-secondary px-4 py-2 text-sm"
                      disabled={telemetryLoading() || !telemetryData()}
                    >
                      <Download class="h-4 w-4" />
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => exportData('json')}
                      class="btn-secondary px-4 py-2 text-sm"
                      disabled={telemetryLoading() || !telemetryData()}
                    >
                      <Download class="h-4 w-4" />
                      Export JSON
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
