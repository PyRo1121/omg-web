import { type Component, createSignal, onMount, Show, For, createMemo } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  Monitor,
  LogOut,
  Shield,
  Clock,
  CheckCircle,
  Github,
  Chrome,
  Mail,
  Terminal,
  Package,
  Zap,
  Activity,
  Award,
  BarChart3,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Rocket,
  Gem,
  Trophy,
  Star,
  Flame,
  Crown,
  Heart,
  Sparkles,
  Swords,
  Bug,
  Code,
  GitBranch,
  Coffee,
  Lightbulb,
  Copy,
  Check,
  Download,
  Calendar,
  RefreshCw,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-solid';
import { signOut } from '~/lib/auth-client';
import { createDashboardView } from '~/lib/state/dashboard-view';
import AdminDashboard from '~/components/dashboard/AdminDashboard';
import BackgroundMesh from '~/components/3d/BackgroundMesh';

interface BetterAuthSession {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
  };
  session: {
    token: string;
    expiresAt: Date;
  };
}

interface DashboardPageProps {
  session: BetterAuthSession;
}

type TabType = 'overview' | 'analytics' | 'achievements' | 'machines' | 'settings' | 'admin';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getProviderIcon(provider: string) {
  switch (provider) {
    case 'github':
      return Github;
    case 'google':
      return Chrome;
    case 'credential':
      return Mail;
    default:
      return Shield;
  }
}

function getAchievementIcon(_emoji: string, name: string) {
  const nameUpper = name.toUpperCase();

  if (nameUpper.includes('FIRST') || nameUpper.includes('START')) {
    return Rocket;
  }
  if (nameUpper.includes('SPEED') || nameUpper.includes('FAST')) {
    return Zap;
  }
  if (nameUpper.includes('PACKAGE') || nameUpper.includes('INSTALL')) {
    return Package;
  }
  if (nameUpper.includes('COMMAND') || nameUpper.includes('RUN')) {
    return Terminal;
  }
  if (nameUpper.includes('SECURITY') || nameUpper.includes('SBOM')) {
    return Shield;
  }
  if (nameUpper.includes('BUG') || nameUpper.includes('FIX')) {
    return Bug;
  }
  if (nameUpper.includes('RUNTIME') || nameUpper.includes('SWITCH')) {
    return Code;
  }
  if (nameUpper.includes('MASTER') || nameUpper.includes('EXPERT')) {
    return Crown;
  }
  if (nameUpper.includes('STREAK') || nameUpper.includes('DAILY')) {
    return Flame;
  }
  if (nameUpper.includes('STAR') || nameUpper.includes('TOP')) {
    return Star;
  }
  if (nameUpper.includes('DIAMOND') || nameUpper.includes('ELITE')) {
    return Gem;
  }
  if (nameUpper.includes('TROPHY') || nameUpper.includes('CHAMPION')) {
    return Trophy;
  }
  if (nameUpper.includes('LOVE') || nameUpper.includes('HEART')) {
    return Heart;
  }
  if (nameUpper.includes('COFFEE') || nameUpper.includes('CAFFEINE')) {
    return Coffee;
  }
  if (nameUpper.includes('IDEA') || nameUpper.includes('INNOVATION')) {
    return Lightbulb;
  }
  if (nameUpper.includes('BRANCH') || nameUpper.includes('GIT')) {
    return GitBranch;
  }
  if (nameUpper.includes('BATTLE') || nameUpper.includes('FIGHT')) {
    return Swords;
  }

  return Target;
}

const DashboardPage: Component<DashboardPageProps> = props => {
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
  const [dateRange, setDateRange] = createSignal<'7d' | '14d' | '30d' | '90d'>('30d');
  const [activeTab, setActiveTab] = createSignal<TabType>('overview');

  onMount(() => loadAll());

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (err) {
      console.error('Sign out error:', err);
      setError('Failed to sign out');
    }
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

    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
      filename = `omg-telemetry-${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      const rows = [
        ['Date', 'Commands', 'Packages Installed', 'Packages Searched', 'Time Saved (ms)'],
        ...data.daily.map(d => [
          d.date,
          d.commands_run,
          d.packages_installed || 0,
          d.packages_searched || 0,
          d.time_saved_ms,
        ]),
      ];
      content = rows.map(row => row.join(',')).join('\n');
      filename = `omg-telemetry-${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimeSaved = createMemo(() => {
    const ms = telemetryData()?.usage.total_time_saved_ms || 0;
    const hours = ms / 3600000;
    if (hours < 1) {
      return `${Math.round((ms / 60000) * 10) / 10}m`;
    }
    if (hours < 24) {
      return `${Math.round(hours * 10) / 10}h`;
    }
    return `${Math.round((hours / 24) * 10) / 10}d`;
  });

  const averageCommandsPerDay = createMemo(() => {
    const data = telemetryData();
    if (!data || data.daily.length === 0) {
      return 0;
    }
    const total = data.daily.reduce((sum, d) => sum + d.commands_run, 0);
    return Math.round(total / data.daily.length);
  });

  const peakDay = createMemo(() => {
    const data = telemetryData();
    if (!data || data.daily.length === 0) {
      return null;
    }
    return data.daily.reduce(
      (max, d) => (d.commands_run > max.commands_run ? d : max),
      data.daily[0]
    );
  });

  const totalPackages = createMemo(() => {
    const data = telemetryData();
    if (!data) {
      return 0;
    }
    return data.usage.total_packages_installed + data.usage.total_packages_searched;
  });

  const pageBg =
    'min-h-screen bg-[#0a0a0a] text-slate-200 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden relative';
  const bgEffects = (
    <>
      <div class="animate-pulse-slow pointer-events-none fixed top-[-20%] left-[-10%] h-[50%] w-[50%] rounded-full bg-indigo-600/10 blur-[120px]" />
      <div
        class="animate-pulse-slow pointer-events-none fixed right-[-10%] bottom-[-20%] h-[50%] w-[50%] rounded-full bg-purple-600/10 blur-[120px]"
        style={{ 'animation-delay': '1s' }}
      />
      <div
        class="animate-pulse-slow pointer-events-none fixed top-[20%] right-[10%] h-[30%] w-[30%] rounded-full bg-cyan-600/5 blur-[100px]"
        style={{ 'animation-delay': '2s' }}
      />
    </>
  );

  const glassPanel =
    'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl hover:border-indigo-500/30 transition-all duration-300';

  const tabs = createMemo(() => {
    const role = telemetryData()?.user?.role;
    console.log('[Tabs Memo] Computing tabs. User role:', role);

    const baseTabs: Array<{ id: TabType; label: string; icon: typeof LayoutDashboard }> = [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'achievements', label: 'Achievements', icon: Award },
      { id: 'machines', label: 'Machines', icon: Monitor },
      { id: 'settings', label: 'Settings', icon: Settings },
    ];

    if (role === 'admin') {
      console.log('[Tabs Memo] Adding admin tab');
      baseTabs.push({ id: 'admin', label: 'Admin', icon: Shield });
    }

    console.log('[Tabs Memo] Final tabs count:', baseTabs.length);
    return baseTabs;
  });

  const StatCard = (cardProps: {
    title: string;
    value: string;
    icon: Component<{ class?: string }>;
    color: string;
    sub?: string;
    trend?: number;
  }) => {
    const trendIcon =
      !cardProps.trend || cardProps.trend === 0
        ? Minus
        : cardProps.trend > 0
          ? TrendingUp
          : TrendingDown;

    const trendColor = () => {
      if (!cardProps.trend || cardProps.trend === 0) {
        return 'text-slate-500';
      }
      return cardProps.trend > 0 ? 'text-emerald-400' : 'text-red-400';
    };

    return (
      <div
        class={`${glassPanel} group p-6 transition-all hover:scale-[1.02] hover:border-indigo-500/30`}
      >
        <div class="mb-4 flex items-start justify-between">
          <div
            class={`rounded-xl bg-gradient-to-r p-3 from-${cardProps.color}-500/20 to-purple-500/20`}
          >
            <cardProps.icon class={`h-6 w-6 text-${cardProps.color}-400`} />
          </div>
          <Show when={cardProps.trend !== undefined}>
            <div class={`flex items-center gap-1 text-xs font-medium ${trendColor()}`}>
              <Dynamic component={trendIcon} class="h-4 w-4" />
              <span>{Math.abs(cardProps.trend || 0).toFixed(1)}%</span>
            </div>
          </Show>
        </div>
        <h3 class="mb-1 text-sm font-medium text-slate-400">{cardProps.title}</h3>
        <div class="gradient-text mb-2 text-3xl font-bold">{cardProps.value}</div>
        <Show when={cardProps.sub}>
          <p class="text-xs text-slate-500">{cardProps.sub}</p>
        </Show>
      </div>
    );
  };

  return (
    <div class={pageBg}>
      <BackgroundMesh />
      {bgEffects}

      <div class="relative z-10 min-h-screen">
        <div class="mx-auto max-w-7xl">
          <header class="px-6 pt-6 pb-4">
            <div class="flex items-start justify-between">
              <div>
                <h1 class="text-3xl font-bold">
                  <span class="gradient-text">Dashboard</span>
                </h1>
                <p class="mt-1 text-slate-400">Welcome back, {props.session.user.name}</p>
              </div>
              <div class="flex items-center gap-3">
                <Show when={!telemetryLoading() && telemetryData()}>
                  <button
                    onClick={loadTelemetry}
                    class="btn-secondary px-3 py-2 text-sm"
                    title="Refresh data"
                  >
                    <RefreshCw class="h-4 w-4" />
                  </button>
                </Show>
                <button onClick={handleSignOut} class="btn-secondary px-4 py-2 text-sm">
                  <LogOut class="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </header>

          <div class="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl">
            <div class="px-6">
              <nav class="no-scrollbar flex gap-1 overflow-x-auto" role="tablist">
                <For each={tabs()}>
                  {tab => (
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      class={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all ${
                        activeTab() === tab.id ? 'text-white' : 'text-slate-400 hover:text-white'
                      }`}
                      role="tab"
                      aria-selected={activeTab() === tab.id}
                    >
                      <tab.icon class="h-4 w-4" />
                      <span>{tab.label}</span>
                      <Show when={activeTab() === tab.id}>
                        <div class="absolute right-0 bottom-0 left-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400" />
                      </Show>
                    </button>
                  )}
                </For>
              </nav>
            </div>
          </div>

          <div class="px-6 py-6">
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
                  <AlertCircle class="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" />
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
                      <div class="mt-6 border-t border-white/10 pt-6">
                        <h3 class="mb-4 text-sm font-medium text-slate-400">License</h3>
                        <div class="rounded-lg border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-4">
                          <div class="mb-3 flex items-center gap-2">
                            <Award class="h-5 w-5 text-yellow-400" />
                            <span class="font-bold text-white uppercase">
                              {telemetryData()!.license.tier}
                            </span>
                          </div>
                          <div class="mb-2 flex items-center justify-between gap-2">
                            <p class="flex-1 truncate font-mono text-xs text-slate-400">
                              {telemetryData()!.license.license_key}
                            </p>
                            <button
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
                    </Show>
                  </div>

                  <div class={`${glassPanel} p-6 lg:col-span-2`}>
                    <h3 class="gradient-text mb-4 text-lg font-bold">Quick Stats</h3>
                    <Show when={!telemetryLoading() && telemetryData()}>
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
                          value={telemetryData()!.usage.total_commands.toLocaleString()}
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
                          value={telemetryData()!
                            .machines.filter(m => m.is_active)
                            .length.toString()}
                          icon={Monitor}
                          color="cyan"
                          sub={`${telemetryData()!.machines.length} total`}
                        />
                      </div>
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
                        <div>
                          <div class="mb-1 text-sm text-slate-400">Peak Productivity</div>
                          <div class="text-2xl font-bold text-white">{peakDay()!.commands_run}</div>
                          <div class="mt-1 text-xs text-slate-500">
                            on {formatShortDate(peakDay()!.date)}
                          </div>
                        </div>
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

                <Show
                  when={!telemetryLoading() && telemetryData() && telemetryData()!.daily.length > 0}
                >
                  <div class={`${glassPanel} p-6`}>
                    <h3 class="mb-6 flex items-center gap-2 text-lg font-bold">
                      <Activity class="h-5 w-5 text-indigo-400" />
                      <span class="gradient-text">Recent Activity (7 Days)</span>
                    </h3>
                    <div class="flex h-48 items-end justify-between gap-2">
                      <For each={telemetryData()!.daily.slice(-7)}>
                        {day => {
                          const maxCommands = Math.max(
                            ...telemetryData()!
                              .daily.slice(-7)
                              .map(d => d.commands_run),
                            1
                          );
                          const commandsHeight = (day.commands_run / maxCommands) * 100;
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
                                  style={{ height: `${commandsHeight}%`, 'min-height': '4px' }}
                                  title={`${day.commands_run} commands`}
                                />
                              </div>
                              <span class="text-xs text-slate-500">
                                {formatShortDate(day.date)}
                              </span>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
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
                      <For
                        each={[
                          { label: '7d', value: '7d' as const },
                          { label: '14d', value: '14d' as const },
                          { label: '30d', value: '30d' as const },
                          { label: '90d', value: '90d' as const },
                        ]}
                      >
                        {option => (
                          <button
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
                        onClick={() => exportData('csv')}
                        class="btn-secondary px-3 py-2 text-sm"
                        title="Export as CSV"
                      >
                        <Download class="h-4 w-4" />
                        CSV
                      </button>
                      <button
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

                <Show when={!telemetryLoading() && telemetryData()}>
                  <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                      title="Time Saved"
                      value={formatTimeSaved()}
                      icon={Clock}
                      color="emerald"
                      sub="Productivity gains"
                      trend={telemetryData()!.usage.time_saved_trend}
                    />
                    <StatCard
                      title="Commands Run"
                      value={telemetryData()!.usage.total_commands.toLocaleString()}
                      icon={Terminal}
                      color="indigo"
                      sub="Total executions"
                      trend={telemetryData()!.usage.commands_trend}
                    />
                    <StatCard
                      title="Packages Installed"
                      value={telemetryData()!.usage.total_packages_installed.toLocaleString()}
                      icon={Package}
                      color="purple"
                      sub="Managed packages"
                    />
                    <StatCard
                      title="Runtime Switches"
                      value={telemetryData()!.usage.total_runtimes_switched.toLocaleString()}
                      icon={Zap}
                      color="amber"
                      sub="Version changes"
                    />
                  </div>

                  <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                      title="SBOM Generated"
                      value={telemetryData()!.usage.total_sbom_generated.toLocaleString()}
                      icon={Shield}
                      color="indigo"
                      sub="Security scans"
                    />
                    <StatCard
                      title="Vulnerabilities"
                      value={telemetryData()!.usage.total_vulnerabilities_found.toLocaleString()}
                      icon={AlertCircle}
                      color="red"
                      sub="Security issues found"
                    />
                    <StatCard
                      title="Packages Searched"
                      value={telemetryData()!.usage.total_packages_searched.toLocaleString()}
                      icon={BarChart3}
                      color="cyan"
                      sub="Search queries"
                    />
                    <StatCard
                      title="Active Machines"
                      value={telemetryData()!
                        .machines.filter(m => m.is_active)
                        .length.toString()}
                      icon={Monitor}
                      color="cyan"
                      sub={`${telemetryData()!.machines.length}/${telemetryData()!.license.max_machines} total`}
                    />
                  </div>

                  <Show
                    when={telemetryData()!.daily.length > 0}
                    fallback={
                      <div class={`${glassPanel} p-12 text-center`}>
                        <Activity class="mx-auto mb-4 h-12 w-12 text-slate-600" />
                        <h3 class="mb-2 text-lg font-bold text-white">No Activity Data Yet</h3>
                        <p class="mx-auto mb-6 max-w-md text-sm text-slate-400">
                          Start using the OMG CLI to see your activity trends and usage patterns.
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
                        <For each={telemetryData()!.daily}>
                          {day => {
                            const maxCommands = Math.max(
                              ...telemetryData()!.daily.map(d => d.commands_run),
                              1
                            );
                            const maxPackages = Math.max(
                              ...telemetryData()!.daily.map(d => d.packages_installed || 0),
                              1
                            );
                            const commandsHeight = (day.commands_run / maxCommands) * 100;
                            const packagesHeight =
                              ((day.packages_installed || 0) / maxPackages) * 100;
                            return (
                              <div class="group flex flex-1 flex-col items-center gap-2">
                                <div
                                  class="flex w-full items-end gap-1"
                                  style={{ height: '200px' }}
                                >
                                  <div
                                    class="flex-1 rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all group-hover:from-indigo-500 group-hover:to-indigo-300"
                                    style={{ height: `${commandsHeight}%`, 'min-height': '4px' }}
                                    title={`${day.commands_run} commands`}
                                  />
                                  <div
                                    class="flex-1 rounded-t-lg bg-gradient-to-t from-purple-600 to-purple-400 transition-all group-hover:from-purple-500 group-hover:to-purple-300"
                                    style={{ height: `${packagesHeight}%`, 'min-height': '4px' }}
                                    title={`${day.packages_installed || 0} packages`}
                                  />
                                </div>
                                <span class="text-xs text-slate-500">
                                  {formatShortDate(day.date)}
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

                  <Show when={telemetryData()!.global_stats}>
                    <div class={`${glassPanel} p-6`}>
                      <h3 class="mb-6 flex items-center gap-2 text-lg font-bold">
                        <TrendingUp class="h-5 w-5 text-emerald-400" />
                        <span class="gradient-text">Global Stats</span>
                      </h3>
                      <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
                        <div>
                          <div class="mb-1 text-sm text-slate-400">Top Package</div>
                          <div class="text-xl font-bold text-white">
                            {telemetryData()!.global_stats!.top_package}
                          </div>
                        </div>
                        <div>
                          <div class="mb-1 text-sm text-slate-400">Top Runtime</div>
                          <div class="text-xl font-bold text-white">
                            {telemetryData()!.global_stats!.top_runtime}
                          </div>
                        </div>
                        <div>
                          <div class="mb-1 text-sm text-slate-400">Your Percentile</div>
                          <div class="text-xl font-bold text-emerald-400">
                            Top {telemetryData()!.global_stats!.percentile}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </Show>
                </Show>
              </div>
            </Show>

            <Show when={!loading() && activeTab() === 'achievements'}>
              <div class="animate-fade-in-up space-y-6">
                <div class="mb-4 flex items-center justify-between">
                  <h2 class="gradient-text text-2xl font-bold">Achievements</h2>
                  <Show when={!telemetryLoading() && telemetryData()}>
                    <div class="text-sm text-slate-400">
                      <span class="font-bold text-white">
                        {telemetryData()!.achievements.filter(a => a.unlocked).length}
                      </span>
                      {' / '}
                      <span>{telemetryData()!.achievements.length}</span>
                      {' unlocked'}
                    </div>
                  </Show>
                </div>

                <Show when={!telemetryLoading() && telemetryData()}>
                  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <For each={telemetryData()!.achievements}>
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
                                    <CheckCircle class="h-4 w-4 flex-shrink-0 text-emerald-400" />
                                  </Show>
                                </div>
                                <div class="text-sm text-slate-400">{achievement.description}</div>
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
                            <Show when={achievement.unlocked && achievement.unlocked_at}>
                              <div class="mt-3 text-xs text-slate-500">
                                Unlocked {formatShortDate(achievement.unlocked_at!)}
                              </div>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>

            <Show when={!loading() && activeTab() === 'machines'}>
              <div class="animate-fade-in-up space-y-6">
                <div class="mb-4 flex items-center justify-between">
                  <h2 class="gradient-text text-2xl font-bold">Machines</h2>
                  <Show when={!telemetryLoading() && telemetryData()}>
                    <div class="text-sm text-slate-400">
                      <span class="font-bold text-white">
                        {telemetryData()!.machines.filter(m => m.is_active).length}
                      </span>
                      {' / '}
                      <span>{telemetryData()!.license.max_machines}</span>
                      {' active'}
                    </div>
                  </Show>
                </div>

                <Show when={!telemetryLoading() && telemetryData()}>
                  <Show
                    when={telemetryData()!.machines.length > 0}
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
                      <For each={telemetryData()!.machines}>
                        {machine => (
                          <div
                            class={`${glassPanel} p-6 transition-all hover:border-indigo-500/30`}
                          >
                            <div class="mb-4 flex items-center justify-between">
                              <div class="flex items-center gap-3">
                                <Monitor class="h-5 w-5 text-cyan-400" />
                                <span class="font-medium text-white">
                                  {machine.hostname || machine.machine_id.substring(0, 8)}
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
                                  v{machine.omg_version || 'unknown'}
                                </span>
                              </div>
                              <div class="flex items-center justify-between">
                                <span class="text-slate-500">Last Seen</span>
                                <span class="text-slate-300">
                                  {formatShortDate(machine.last_seen_at)}
                                </span>
                              </div>
                              <div class="flex items-center justify-between">
                                <span class="text-slate-500">Machine ID</span>
                                <span class="font-mono text-xs text-slate-300">
                                  {machine.machine_id.substring(0, 12)}...
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
              </div>
            </Show>

            <Show
              when={!loading() && activeTab() === 'admin' && telemetryData()?.user.role === 'admin'}
            >
              <div class="animate-fade-in-up">
                <AdminDashboard />
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
                                  {session.userAgent?.split(' ')[0] || 'Unknown Browser'}
                                </p>
                                <Show when={session.isCurrent}>
                                  <span class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-400">
                                    Current
                                  </span>
                                </Show>
                              </div>
                              <p class="mt-1 text-sm text-slate-400">
                                {session.ipAddress || 'Unknown location'}
                              </p>
                              <div class="mt-2 flex gap-4 text-xs text-slate-500">
                                <span>Created: {formatDate(session.createdAt)}</span>
                                <span>Expires: {formatDate(session.expiresAt)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>

                <Show when={telemetryData()?.license}>
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
                            {telemetryData()!.license.tier}
                          </div>
                        </div>
                        <div>
                          <div class="mb-2 text-sm text-slate-400">Status</div>
                          <div class="text-2xl font-bold text-emerald-400 capitalize">
                            {telemetryData()!.license.status}
                          </div>
                        </div>
                        <div>
                          <div class="mb-2 text-sm text-slate-400">Max Machines</div>
                          <div class="text-2xl font-bold text-white">
                            {telemetryData()!.license.max_machines}
                          </div>
                        </div>
                        <div>
                          <div class="mb-2 text-sm text-slate-400">License Key</div>
                          <div class="flex items-center gap-2">
                            <code class="rounded bg-black/30 px-3 py-1.5 font-mono text-sm text-slate-300">
                              {telemetryData()!.license.license_key}
                            </code>
                            <button
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
                          <For each={telemetryData()!.license.features}>
                            {feature => (
                              <div class="flex items-center gap-2">
                                <CheckCircle class="h-4 w-4 text-emerald-400" />
                                <span class="text-sm text-slate-300">{feature}</span>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </div>
                  </div>
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
                      onClick={() => exportData('csv')}
                      class="btn-secondary px-4 py-2 text-sm"
                      disabled={telemetryLoading() || !telemetryData()}
                    >
                      <Download class="h-4 w-4" />
                      Export CSV
                    </button>
                    <button
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
