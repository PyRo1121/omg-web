import { reportClientError } from '~/lib/observability';
import type { AdminTab } from '~/types';
import { type Component, createMemo, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import { createQuery } from '@tanstack/solid-query';
import {
  Activity,
  Users,
  Download,
  ChartColumn,
  CreditCard,
  RotateCcwClock,
  ChevronDown,
  Lightbulb,
  Calendar,
  Save,
} from 'lucide-solid';
import * as api from '../../lib/api';
import { valueForKey } from '../../lib/lookup';
import {
  useAdminDashboard,
  useAdminFirehose,
  useAdminAdvancedMetrics,
  useSiteRealtimeAnalytics,
} from '../../lib/api-hooks';
import { CardSkeleton } from '../ui/Skeleton';
import { RevenueTab } from './admin/RevenueTab';
import { AuditLogTab } from './admin/AuditLogTab';
import { CustomerDetailDrawer } from './admin/CustomerDetailDrawer';
import { InsightsTab } from './admin/insights/InsightsTab';
import { OverviewTab } from './admin/tabs/OverviewTab';
import { CRMTab } from './admin/tabs/CRMTab';
import { AnalyticsTab, getDateRangeDays } from './admin/tabs/AnalyticsTab';
import { TabErrorBoundary } from './admin/shared/TabErrorBoundary';
import ErrorCard from './admin/shared/ErrorCard';
import { createDashboardStore } from '../../lib/stores/dashboardStore';
import type { FirehoseEvent, GeoDistribution, CommandHealth, CRMCustomer } from './premium/types';
import type { OverviewMetrics } from './admin/tabs/OverviewTab';

/** Match an untrusted string against a fixed set of allowed values. */
function oneOf<T extends string>(values: ReadonlyArray<T>, key: string): T | undefined {
  return values.find(value => value === key);
}

function toOverviewMetrics(
  dashboard: api.AdminOverview | undefined,
  metrics: api.AdminAdvancedMetrics | undefined
): OverviewMetrics {
  const atRiskUsers = metrics?.churn_risk_segments
    ? metrics.churn_risk_segments
        .filter(segment => segment.risk_segment === 'high' || segment.risk_segment === 'critical')
        .reduce((total, segment) => total + segment.user_count, 0)
    : null;
  return {
    mrr: dashboard?.overview?.mrr ?? null,
    dau: metrics?.engagement?.dau ?? dashboard?.daily_active_users?.[0]?.active_users ?? null,
    wau: metrics?.engagement?.wau ?? null,
    mau: metrics?.engagement?.mau ?? null,
    atRiskCount: atRiskUsers,
  };
}

interface RawFirehoseEvent {
  id?: string;
  event_name?: string;
  action?: string;
  machine_id?: string;
  hostname?: string;
  platform?: string;
  timestamp?: string;
  created_at?: string;
  duration_ms?: number | undefined;
  success?: boolean;
  metadata?: {
    hostname?: string;
    platform?: string;
  };
}

function transformFirehoseEvents(events: ReadonlyArray<RawFirehoseEvent>): FirehoseEvent[] {
  return events.map((e, i) => ({
    id: e.id || `evt-${i}`,
    event_type: mapEventType(e.event_name || e.action || ''),
    event_name: e.event_name || e.action || 'unknown',
    machine_id: e.machine_id || '',
    hostname: e.hostname || e.metadata?.hostname || '',
    platform: e.platform || e.metadata?.platform || 'unknown',
    timestamp: e.timestamp || e.created_at,
    duration_ms: e.duration_ms,
    success: e.success,
  }));
}

function mapEventType(eventName: string): FirehoseEvent['event_type'] {
  const lower = eventName.toLowerCase();
  if (lower.includes('install')) {
    return 'install';
  }
  if (lower.includes('search')) {
    return 'search';
  }
  if (lower.includes('runtime') || lower.includes('use ')) {
    return 'runtime_switch';
  }
  if (lower.includes('error') || lower.includes('fail')) {
    return 'error';
  }
  return 'command';
}

function transformGeoDistribution(
  data: ReadonlyArray<{ dimension: string; count: number }>
): GeoDistribution[] {
  const total = data.reduce((sum, d) => sum + d.count, 0) || 1;
  return data.map(d => ({
    country: getCountryName(d.dimension),
    country_code: d.dimension || 'XX',
    count: d.count,
    percentage: (d.count / total) * 100,
  }));
}

function getCountryName(code: string): string {
  const countries = {
    US: 'United States',
    DE: 'Germany',
    GB: 'United Kingdom',
    FR: 'France',
    CA: 'Canada',
    JP: 'Japan',
    AU: 'Australia',
    BR: 'Brazil',
    IN: 'India',
    NL: 'Netherlands',
    SE: 'Sweden',
    ES: 'Spain',
    IT: 'Italy',
    KR: 'South Korea',
  } as const;
  return valueForKey(Object.entries(countries), code) ?? (code || 'Unknown');
}

function transformToCRMCustomer(user: api.AdminUser): CRMCustomer {
  return {
    id: user.id,
    email: user.email,
    company: user.company ?? undefined,
    tier: user.tier,
    status: user.status,
    engagement_score: user.engagement_score,
    created_at: user.created_at,
    total_commands: user.total_commands,
    machine_count: user.machine_count,
  };
}

const AdminDashboard: Component = () => {
  const [store, actions] = createDashboardStore();
  let exportMenuRoot: HTMLDivElement | undefined;
  let exportButton: HTMLButtonElement | undefined;
  let saveViewButton: HTMLButtonElement | undefined;

  onMount(() => {
    const closeOnPointerDown = (event: PointerEvent): void => {
      if (
        store.ui.exportMenuOpen &&
        event.target instanceof Node &&
        !exportMenuRoot?.contains(event.target)
      ) {
        actions.closeExportMenu();
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      if (store.ui.exportMenuOpen) {
        actions.closeExportMenu();
        exportButton?.focus();
      }
      if (store.views.showSaveModal) {
        actions.hideSaveViewModal();
        saveViewButton?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    onCleanup(() => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    });
  });

  const dashboardQuery = useAdminDashboard();
  const firehoseQuery = useAdminFirehose(100, () => store.navigation.activeTab === 'overview');
  const crmUsersQuery = createQuery(() => ({
    queryKey: ['admin-crm-users', store.crm.page, 25, store.crm.search],
    queryFn: () => api.getAdminUsers(store.crm.page, 25, store.crm.search),
    enabled: store.navigation.activeTab === 'crm',
  }));
  const advancedMetricsQuery = useAdminAdvancedMetrics(
    () => store.navigation.activeTab === 'overview'
  );
  const siteGeoQuery = createQuery(() => ({
    queryKey: ['site-geo-analytics', getDateRangeDays(store.filters.dateRange)],
    queryFn: () => api.getSiteGeoAnalytics(getDateRangeDays(store.filters.dateRange)),
    staleTime: 60 * 1000,
    enabled: store.navigation.activeTab === 'analytics',
  }));
  const realtimeQuery = useSiteRealtimeAnalytics(() => store.navigation.activeTab === 'analytics');
  const siteOverviewQuery = createQuery(() => ({
    queryKey: ['site-analytics-overview', getDateRangeDays(store.filters.dateRange)],
    queryFn: () => api.getSiteAnalyticsOverview(getDateRangeDays(store.filters.dateRange)),
    staleTime: 60 * 1000,
    enabled: store.navigation.activeTab === 'analytics',
  }));

  const overviewMetrics = createMemo(() =>
    toOverviewMetrics(dashboardQuery.data, advancedMetricsQuery.data)
  );

  const firehoseEvents = createMemo(() =>
    transformFirehoseEvents(firehoseQuery.data?.events || [])
  );

  const geoDistribution = createMemo(() => {
    const geoData = siteGeoQuery.data?.geo_distribution || [];
    if (geoData.length > 0) {
      return geoData.map(g => ({
        country: getCountryName(g.country_code),
        country_code: g.country_code,
        count: g.user_count,
        percentage: g.percentage,
      }));
    }
    return transformGeoDistribution(dashboardQuery.data?.geo_distribution || []);
  });

  const commandHealth = createMemo((): CommandHealth => {
    const health = dashboardQuery.data?.overview?.command_health;
    const success = health?.success ?? 0;
    const failure = health?.failure ?? 0;
    const total = success + failure;
    if (total === 0) {
      return { success: null, failure: null };
    }
    return {
      success: (success / total) * 100,
      failure: (failure / total) * 100,
    };
  });

  const crmCustomers = createMemo(() =>
    (crmUsersQuery.data?.users || []).map(transformToCRMCustomer)
  );

  const crmPagination = () => crmUsersQuery.data?.pagination;

  // Export handlers
  const handleExport = async (type: 'users' | 'usage' | 'audit') => {
    actions.setExporting(true);
    actions.closeExportMenu();
    try {
      let data: string;
      let filename: string;
      switch (type) {
        case 'users':
          data = await api.exportAdminUsers();
          filename = `omg-users-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'usage':
          data = await api.exportAdminUsage(getDateRangeDays(store.filters.dateRange));
          filename = `omg-usage-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'audit':
          data = await api.exportAdminAudit(getDateRangeDays(store.filters.dateRange));
          filename = `omg-audit-${new Date().toISOString().split('T')[0]}.csv`;
          break;
      }
      api.downloadCSV(data, filename);
    } catch (error) {
      reportClientError('Export failed:', error);
    } finally {
      actions.setExporting(false);
    }
  };

  const tabCounts = createMemo(() => ({
    crm: crmUsersQuery.data?.pagination?.total || 0,
    insights: advancedMetricsQuery.data?.expansion_opportunities?.length || 0,
  }));

  const TABS_ORDER: AdminTab[] = ['overview', 'crm', 'analytics', 'insights', 'revenue', 'audit'];

  const tabButtons = new Map<AdminTab, HTMLButtonElement>();

  const handleTabKeyDown = (e: KeyboardEvent, tabId: AdminTab) => {
    const currentIndex = TABS_ORDER.indexOf(tabId);
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % TABS_ORDER.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + TABS_ORDER.length) % TABS_ORDER.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = TABS_ORDER.length - 1;
    } else {
      return;
    }

    const nextTab = TABS_ORDER[nextIndex];
    if (nextTab === undefined) {
      return;
    }
    actions.setTab(nextTab);
    tabButtons.get(nextTab)?.focus();
  };

  const TabButton = (props: {
    id: AdminTab;
    icon: Component<{ size?: number }>;
    label: string;
    count?: number;
  }) => {
    const isActive = () => store.navigation.activeTab === props.id;

    return (
      <button
        ref={element => tabButtons.set(props.id, element)}
        id={`tab-${props.id}`}
        role="tab"
        aria-selected={isActive()}
        aria-controls={`tabpanel-${props.id}`}
        tabindex={isActive() ? 0 : -1}
        onClick={() => actions.setTab(props.id)}
        onKeyDown={e => handleTabKeyDown(e, props.id)}
        class={`manifest-label relative flex items-center gap-2 rounded-xl px-4 py-3 ${
          isActive()
            ? 'bg-[var(--signal)] text-[var(--signal-ink)]'
            : 'text-[var(--ink-muted)] hover:bg-white/[0.05] hover:text-[var(--ink)]'
        }`}
      >
        <span class="relative">
          <props.icon size={15} />
        </span>
        <span class="relative">{props.label}</span>
        <Show when={props.count !== undefined && props.count > 0}>
          <span
            class={`text-2xs relative rounded-full px-1.5 py-0.5 font-black ${
              isActive() ? 'bg-electric-500/20 text-electric-400' : 'text-nebula-300 bg-white/10'
            }`}
          >
            {props.count}
          </span>
        </Show>
      </button>
    );
  };

  return (
    <div class="space-y-8 pb-20">
      <header class="grid gap-6 border-b border-[var(--rule)] pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p class="font-mono text-xs text-[var(--signal)]">Admin operations</p>
          <h1 class="font-display mt-3 text-5xl font-medium tracking-[-0.055em] text-[var(--ink)]">
            Control center
          </h1>
          <p class="mt-2 font-mono text-xs text-[var(--ink-muted)]">
            Infrastructure / revenue / fleet telemetry
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <Calendar size={14} class="text-nebula-500" />
            <select
              value={store.filters.dateRange}
              onChange={e =>
                actions.setDateRange(oneOf(['7d', '30d', '90d'], e.currentTarget.value) ?? '30d')
              }
              class="bg-transparent text-sm font-bold text-white focus:outline-none"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          <button
            ref={element => {
              saveViewButton = element;
            }}
            type="button"
            onClick={() => actions.showSaveViewModal()}
            class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white transition-all hover:bg-white/[0.06] sm:text-sm"
          >
            <Save size={14} />
            <span class="hidden sm:inline">Save View</span>
          </button>

          <div
            ref={element => {
              exportMenuRoot = element;
            }}
            class="relative"
          >
            <button
              ref={element => {
                exportButton = element;
              }}
              type="button"
              aria-haspopup="menu"
              aria-expanded={store.ui.exportMenuOpen}
              onClick={e => {
                e.stopPropagation();
                actions.toggleExportMenu();
              }}
              disabled={store.ui.isExporting}
              class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white transition-all hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              <Download size={14} />
              <span class="hidden sm:inline">Export</span>
              <ChevronDown
                size={12}
                class={`transition-transform ${store.ui.exportMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <Show when={store.ui.exportMenuOpen}>
              <div
                role="menu"
                class="absolute top-full right-0 z-50 mt-2 w-56 origin-top-right rounded-xl border border-white/10 bg-[#0d0d0e] p-1 shadow-2xl max-sm:right-0 max-sm:left-auto sm:right-0"
              >
                <button
                  role="menuitem"
                  onClick={() => handleExport('users')}
                  class="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/5"
                >
                  <Users size={16} class="text-indigo-400" />
                  <div>
                    <div class="font-medium">Users</div>
                    <div class="text-xs text-slate-500">Export all users as CSV</div>
                  </div>
                </button>
                <button
                  role="menuitem"
                  onClick={() => handleExport('usage')}
                  class="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/5"
                >
                  <ChartColumn size={16} class="text-cyan-400" />
                  <div>
                    <div class="font-medium">Usage ({store.filters.dateRange})</div>
                    <div class="text-xs text-slate-500">Export usage data as CSV</div>
                  </div>
                </button>
                <button
                  role="menuitem"
                  onClick={() => handleExport('audit')}
                  class="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/5"
                >
                  <RotateCcwClock size={16} class="text-purple-400" />
                  <div>
                    <div class="font-medium">Audit Log ({store.filters.dateRange})</div>
                    <div class="text-xs text-slate-500">Export audit log as CSV</div>
                  </div>
                </button>
              </div>
            </Show>
          </div>
        </div>
      </header>

      <Show when={store.views.saved.length > 0}>
        <div class="flex items-center gap-2 overflow-x-auto">
          <span class="text-nebula-500 text-xs font-bold">Saved Views:</span>
          <For each={store.views.saved}>
            {view => (
              <button
                onClick={() => actions.loadView(view)}
                class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-white/[0.06]"
              >
                {view.name}
              </button>
            )}
          </For>
        </div>
      </Show>

      <div
        role="tablist"
        aria-label="Dashboard sections"
        class="no-scrollbar flex items-center overflow-x-auto rounded-2xl border border-[var(--rule)] bg-white/[0.025] p-1"
      >
        <TabButton id="overview" icon={Activity} label="Overview" />
        <TabButton id="crm" icon={Users} label="CRM" count={tabCounts().crm} />
        <TabButton id="analytics" icon={ChartColumn} label="Analytics" />
        <TabButton id="insights" icon={Lightbulb} label="Insights" count={tabCounts().insights} />
        <TabButton id="revenue" icon={CreditCard} label="Revenue" />
        <TabButton id="audit" icon={RotateCcwClock} label="Audit Log" />
      </div>

      <Show when={dashboardQuery.isLoading || advancedMetricsQuery.isLoading}>
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </Show>

      <Show
        when={!dashboardQuery.isError}
        fallback={
          <ErrorCard
            title="Failed to Load Dashboard"
            message="Unable to fetch dashboard data. Please check your connection and try again."
            onRetry={() => dashboardQuery.refetch()}
          />
        }
      >
        <Show when={dashboardQuery.isSuccess}>
          <Switch>
            <Match when={store.navigation.activeTab === 'overview'}>
              <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
                <TabErrorBoundary tab="Overview">
                  <OverviewTab
                    metrics={overviewMetrics()}
                    firehoseEvents={firehoseEvents()}
                    geoDistribution={geoDistribution()}
                    commandHealth={commandHealth()}
                    isMetricsLoading={advancedMetricsQuery.isLoading}
                    isMetricsError={advancedMetricsQuery.isError}
                    onRetryMetrics={() => advancedMetricsQuery.refetch()}
                    onRefresh={() => firehoseQuery.refetch()}
                  />
                </TabErrorBoundary>
              </div>
            </Match>

            <Match when={store.navigation.activeTab === 'crm'}>
              <div role="tabpanel" id="tabpanel-crm" aria-labelledby="tab-crm">
                <TabErrorBoundary tab="CRM">
                  <CRMTab
                    customers={crmCustomers()}
                    pagination={crmPagination()}
                    isLoading={crmUsersQuery.isLoading}
                    isSuccess={crmUsersQuery.isSuccess}
                    isError={crmUsersQuery.isError}
                    onSearchChange={search => {
                      actions.setCRMSearch(search);
                    }}
                    onPageChange={actions.setCRMPage}
                    onViewDetail={actions.setSelectedUserId}
                    onRetry={() => crmUsersQuery.refetch()}
                  />
                </TabErrorBoundary>
              </div>
            </Match>

            <Match when={store.navigation.activeTab === 'analytics'}>
              <div role="tabpanel" id="tabpanel-analytics" aria-labelledby="tab-analytics">
                <TabErrorBoundary tab="Analytics">
                  <AnalyticsTab
                    dateRange={store.filters.dateRange}
                    siteOverview={siteOverviewQuery.data}
                    siteGeo={siteGeoQuery.data}
                    realtimeData={realtimeQuery.data}
                    isOverviewLoading={siteOverviewQuery.isLoading}
                    isRealtimeLoading={realtimeQuery.isLoading}
                    isOverviewSuccess={siteOverviewQuery.isSuccess}
                    isRealtimeSuccess={realtimeQuery.isSuccess}
                    isOverviewError={siteOverviewQuery.isError}
                    isRealtimeError={realtimeQuery.isError}
                    onRetryOverview={() => siteOverviewQuery.refetch()}
                    onRetryRealtime={() => realtimeQuery.refetch()}
                  />
                </TabErrorBoundary>
              </div>
            </Match>

            <Match when={store.navigation.activeTab === 'insights'}>
              <div role="tabpanel" id="tabpanel-insights" aria-labelledby="tab-insights">
                <TabErrorBoundary tab="Insights">
                  <InsightsTab />
                </TabErrorBoundary>
              </div>
            </Match>

            <Match when={store.navigation.activeTab === 'revenue'}>
              <div role="tabpanel" id="tabpanel-revenue" aria-labelledby="tab-revenue">
                <TabErrorBoundary tab="Revenue">
                  <RevenueTab />
                </TabErrorBoundary>
              </div>
            </Match>

            <Match when={store.navigation.activeTab === 'audit'}>
              <div role="tabpanel" id="tabpanel-audit" aria-labelledby="tab-audit">
                <TabErrorBoundary tab="Audit">
                  <AuditLogTab />
                </TabErrorBoundary>
              </div>
            </Match>
          </Switch>
        </Show>
      </Show>

      <Show when={store.views.showSaveModal}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          role="presentation"
          onClick={event => {
            if (event.target === event.currentTarget) {
              actions.hideSaveViewModal();
              saveViewButton?.focus();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-view-title"
            class="bg-void-900 w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl"
          >
            <h3 id="save-view-title" class="mb-4 text-lg font-black text-white">
              Save Current View
            </h3>
            <input
              ref={element => element.focus()}
              type="text"
              value={store.views.newViewName}
              onInput={e => actions.setNewViewName(e.currentTarget.value)}
              placeholder="View name..."
              class="placeholder-nebula-500 mb-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
            />
            <div class="bg-void-850 text-nebula-400 mb-4 space-y-2 rounded-xl border border-white/5 p-3 text-xs">
              <div class="flex justify-between">
                <span>Tab:</span>
                <span class="font-bold text-white">{store.navigation.activeTab}</span>
              </div>
              <div class="flex justify-between">
                <span>Date Range:</span>
                <span class="font-bold text-white">{store.filters.dateRange}</span>
              </div>
            </div>
            <div class="flex justify-end gap-3">
              <button
                onClick={() => actions.hideSaveViewModal()}
                class="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => actions.saveView()}
                disabled={!store.views.newViewName.trim()}
                class="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save View
              </button>
            </div>
          </div>
        </div>
      </Show>

      <CustomerDetailDrawer
        userId={store.crm.selectedUserId}
        onClose={() => actions.setSelectedUserId(null)}
      />
    </div>
  );
};

export default AdminDashboard;
