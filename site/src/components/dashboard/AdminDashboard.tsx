import { reportClientError } from '~/lib/observability';
import type { AdminTab } from '~/types';
import { type Component, createMemo, For, Match, onCleanup, Show, Switch } from 'solid-js';
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
  Funnel,
  GitCompare,
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
import { AnalyticsTab } from './admin/tabs/AnalyticsTab';
import { TabErrorBoundary } from './admin/shared/TabErrorBoundary';
import ErrorCard from './admin/shared/ErrorCard';
import { createDashboardStore } from '../../lib/stores/dashboardStore';
import type {
  AdvancedMetrics,
  FirehoseEvent,
  GeoDistribution,
  CommandHealth,
  CRMCustomer,
} from './premium/types';
import type { OverviewMetrics } from './admin/tabs/OverviewTab';

/** Match an untrusted string against a fixed set of allowed values. */
function oneOf<T extends string>(values: ReadonlyArray<T>, key: string): T | undefined {
  return values.find(value => value === key);
}

const LIFECYCLE_STAGES = [
  'new',
  'onboarding',
  'activated',
  'engaged',
  'power_user',
  'at_risk',
  'churning',
  'churned',
  'reactivated',
  'trial',
  'active',
] as const;

const SEGMENTS = [
  { id: 'all', name: 'All Customers' },
  { id: 'enterprise', name: 'Enterprise' },
  { id: 'team', name: 'Team' },
  { id: 'pro', name: 'Pro' },
  { id: 'power_users', name: 'Power Users' },
  { id: 'at_risk', name: 'At Risk' },
  { id: 'new_users', name: 'New Users (30d)' },
];

const DATE_RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  custom: 30,
} as const;

function toOverviewMetrics(
  dashboard: api.AdminOverview | undefined,
  metrics: api.AdminAdvancedMetrics | undefined
): OverviewMetrics {
  const atRiskUsers =
    metrics?.churn_risk_segments
      ?.filter(s => s.risk_segment === 'high' || s.risk_segment === 'critical')
      .reduce((acc, s) => acc + s.user_count, 0) ?? 0;
  return {
    mrr: dashboard?.overview?.mrr ?? 0,
    dau: metrics?.engagement?.dau ?? dashboard?.daily_active_users?.[0]?.active_users ?? 0,
    wau: metrics?.engagement?.wau ?? 0,
    mau: metrics?.engagement?.mau ?? 0,
    atRiskCount: atRiskUsers,
  };
}

function transformToAdvancedMetrics(
  metrics: api.AdminAdvancedMetrics | undefined
): AdvancedMetrics | undefined {
  if (!metrics) {
    return undefined;
  }
  return {
    engagement: {
      dau: metrics.engagement?.dau || 0,
      wau: metrics.engagement?.wau || 0,
      mau: metrics.engagement?.mau || 0,
      stickiness: {
        daily_to_monthly: metrics.engagement?.stickiness?.daily_to_monthly || '0%',
        daily_to_weekly: metrics.engagement?.stickiness?.weekly_to_monthly || '0%',
      },
    },
    retention: {
      cohorts:
        metrics.retention?.cohorts?.map(c => ({
          cohort_date: c.cohort_date,
          week_number: Number(c.week_number),
          retained_users: c.retained_users,
          retention_rate: 0,
        })) || [],
    },
    ltv_by_tier: [...(metrics.ltv_by_tier ?? [])],
    feature_adoption: {
      install_adopters: metrics.feature_adoption?.install_adopters || 0,
      search_adopters: metrics.feature_adoption?.search_adopters || 0,
      runtime_adopters: metrics.feature_adoption?.runtime_adopters || 0,
      total_users: metrics.feature_adoption?.total_active_users || 0,
    },
    command_heatmap: [...(metrics.command_heatmap ?? [])],
    runtime_adoption:
      metrics.runtime_adoption?.map(r => ({
        runtime: r.runtime,
        unique_users: r.unique_users,
        total_uses: r.total_uses,
        growth_rate: 0,
      })) || [],
    churn_risk_segments:
      metrics.churn_risk_segments?.map(s => ({
        risk_segment: oneOf(['low', 'medium', 'high', 'critical'], s.risk_segment) ?? 'medium',
        user_count: s.user_count,
        tier: s.tier,
        avg_days_inactive: 0,
      })) || [],
    expansion_opportunities:
      metrics.expansion_opportunities?.map(o => ({
        email: o.email,
        tier: o.tier,
        opportunity_type:
          oneOf(['usage_based', 'feature_gate', 'team_growth', 'enterprise'], o.opportunity_type) ??
          'usage_based',
        priority: oneOf(['low', 'medium', 'high', 'urgent'], o.priority) ?? 'medium',
        potential_arr: 0,
      })) || [],
    time_to_value: {
      avg_days_to_activation: metrics.time_to_value?.avg_days_to_activation || 0,
      pct_activated_week1: metrics.time_to_value?.pct_activated_week1 || 0,
      pct_activated_month1: 0,
    },
    revenue_metrics: {
      current_mrr: metrics.revenue_metrics?.current_mrr || 0,
      projected_arr: metrics.revenue_metrics?.projected_arr || 0,
      expansion_mrr_12m: metrics.revenue_metrics?.expansion_mrr_12m || 0,
      net_revenue_retention: 0,
    },
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
    timestamp: e.timestamp || e.created_at || new Date().toISOString(),
    duration_ms: e.duration_ms || 0,
    success: e.success !== false,
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
  const score = user.engagement_score || 50;
  const stage = oneOf(LIFECYCLE_STAGES, user.lifecycle_stage || 'active') ?? 'active';

  return {
    id: user.id,
    email: user.email,
    company: user.company || undefined,
    tier: user.tier || 'free',
    status: oneOf(['active', 'suspended', 'cancelled'], user.status) ?? 'active',
    health: {
      overall_score: score,
      engagement_score: Math.min(100, score + 10),
      activation_score: Math.min(100, score + 5),
      growth_score: Math.max(0, score - 10),
      risk_score: Math.max(0, 100 - score),
      lifecycle_stage: stage,
      predicted_churn_probability: stage === 'at_risk' ? 0.6 : stage === 'churned' ? 0.9 : 0.1,
      predicted_upgrade_probability: score > 70 ? 0.7 : 0.3,
      expansion_readiness_score: score,
      command_velocity_7d: user.total_commands || 0,
      command_velocity_trend: score > 60 ? 'growing' : score > 40 ? 'stable' : 'declining',
    },
    tags: [],
    created_at: user.created_at,
    last_activity_at: user.last_active || user.created_at,
    total_commands: user.total_commands || 0,
    machine_count: user.machine_count || 0,
    mrr: user.tier === 'enterprise' ? 199 : user.tier === 'team' ? 29 : user.tier === 'pro' ? 9 : 0,
  };
}

const AdminDashboard: Component = () => {
  const [store, actions] = createDashboardStore();
  const dashboardQuery = useAdminDashboard();
  const firehoseQuery = useAdminFirehose(100);
  const crmUsersQuery = createQuery(() => ({
    queryKey: ['admin-crm-users', store.crm.page, 25, store.crm.search],
    queryFn: () => api.getAdminUsers(store.crm.page, 25, store.crm.search),
  }));
  const advancedMetricsQuery = useAdminAdvancedMetrics();
  const siteGeoQuery = createQuery(() => ({
    queryKey: ['site-geo-analytics', DATE_RANGE_DAYS[store.filters.dateRange]],
    queryFn: () => api.getSiteGeoAnalytics(DATE_RANGE_DAYS[store.filters.dateRange]),
    staleTime: 60 * 1000,
  }));
  const realtimeQuery = useSiteRealtimeAnalytics();
  const siteOverviewQuery = createQuery(() => ({
    queryKey: ['site-analytics-overview', DATE_RANGE_DAYS[store.filters.dateRange]],
    queryFn: () => api.getSiteAnalyticsOverview(DATE_RANGE_DAYS[store.filters.dateRange]),
    staleTime: 60 * 1000,
  }));

  const overviewMetrics = createMemo(() =>
    toOverviewMetrics(dashboardQuery.data, advancedMetricsQuery.data)
  );

  const advancedMetrics = createMemo(() => transformToAdvancedMetrics(advancedMetricsQuery.data));

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
    const total = (health?.success || 0) + (health?.failure || 0);
    if (total === 0) {
      return { success: 95, failure: 5 };
    }
    return {
      success: ((health?.success || 0) / total) * 100,
      failure: ((health?.failure || 0) / total) * 100,
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
          data = await api.exportAdminUsage(DATE_RANGE_DAYS[store.filters.dateRange]);
          filename = `omg-usage-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'audit':
          data = await api.exportAdminAudit(DATE_RANGE_DAYS[store.filters.dateRange]);
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

  let tabFocusTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    if (tabFocusTimer !== undefined) {
      clearTimeout(tabFocusTimer);
    }
  });

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

    if (tabFocusTimer !== undefined) {
      clearTimeout(tabFocusTimer);
    }
    tabFocusTimer = setTimeout(() => {
      tabFocusTimer = undefined;
      const nextButton = document.querySelector(
        `[role="tab"][aria-controls="tabpanel-${nextTab}"]`
      );
      if (nextButton instanceof HTMLElement) {
        nextButton.focus();
      }
    }, 0);
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
                actions.setDateRange(
                  oneOf(['7d', '30d', '90d', 'custom'], e.currentTarget.value) ?? '30d'
                )
              }
              class="bg-transparent text-sm font-bold text-white focus:outline-none"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <Funnel size={14} class="text-nebula-500" />
            <select
              value={store.filters.segment}
              onChange={e => actions.setSegment(e.currentTarget.value)}
              class="bg-transparent text-sm font-bold text-white focus:outline-none"
            >
              <For each={SEGMENTS}>{seg => <option value={seg.id}>{seg.name}</option>}</For>
            </select>
          </div>

          <button
            onClick={() => actions.toggleCompare()}
            class={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all sm:text-sm ${
              store.filters.compareEnabled
                ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400'
                : 'border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]'
            }`}
          >
            <GitCompare size={14} />
            <span class="hidden sm:inline">Compare</span>
          </button>

          <button
            onClick={() => actions.showSaveViewModal()}
            class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white transition-all hover:bg-white/[0.06] sm:text-sm"
          >
            <Save size={14} />
            <span class="hidden sm:inline">Save View</span>
          </button>

          <div class="relative">
            <button
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
              <div class="absolute top-full right-0 z-50 mt-2 w-56 origin-top-right rounded-xl border border-white/10 bg-[#0d0d0e] p-1 shadow-2xl max-sm:right-0 max-sm:left-auto sm:right-0">
                <button
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

      <Show when={store.filters.compareEnabled}>
        <div class="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
          <GitCompare size={18} class="text-indigo-400" />
          <span class="text-sm font-medium text-indigo-300">
            Comparing current period with previous {DATE_RANGE_DAYS[store.filters.dateRange]} days
          </span>
          <button
            onClick={() => actions.toggleCompare()}
            class="ml-auto rounded-lg bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300 hover:bg-indigo-500/30"
          >
            Exit Comparison
          </button>
        </div>
      </Show>

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
                    advancedMetrics={advancedMetrics()}
                    firehoseEvents={firehoseEvents()}
                    geoDistribution={geoDistribution()}
                    commandHealth={commandHealth()}
                    isMetricsLoading={advancedMetricsQuery.isLoading}
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
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div class="bg-void-900 w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl">
            <h3 class="mb-4 text-lg font-black text-white">Save Current View</h3>
            <input
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
              <div class="flex justify-between">
                <span>Segment:</span>
                <span class="font-bold text-white">
                  {SEGMENTS.find(s => s.id === store.filters.segment)?.name}
                </span>
              </div>
              <div class="flex justify-between">
                <span>Compare Mode:</span>
                <span class="font-bold text-white">
                  {store.filters.compareEnabled ? 'On' : 'Off'}
                </span>
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
