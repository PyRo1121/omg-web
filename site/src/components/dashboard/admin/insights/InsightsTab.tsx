import type { Component } from 'solid-js';
import { Show, For, createSignal } from 'solid-js';
import {
  useAdminAdvancedMetrics,
  useAdminCohorts,
  useAdminDashboard,
} from '../../../../lib/api-hooks';
import { CardSkeleton } from '../../../ui/Skeleton';
import { EngagementMetrics } from './EngagementMetrics';
import { ChurnRiskSegments } from './ChurnRiskSegments';
import { ExpansionOpportunities } from './ExpansionOpportunities';
import { TimeToValueMetrics } from './TimeToValueMetrics';
import { FeatureAdoptionChart } from './FeatureAdoptionChart';
import { CommandHeatmap } from './CommandHeatmap';
import { RuntimeAdoptionChart } from './RuntimeAdoptionChart';
import { CohortRetentionHeatmap } from '../analytics/CohortRetentionHeatmap';
import { GeoDistribution } from '../analytics/GeoDistribution';
import { Lightbulb, RefreshCw, Bookmark } from 'lucide-solid';

type InsightCategory = 'all' | 'engagement' | 'revenue' | 'risk' | 'growth';

const INSIGHT_CATEGORIES: { id: InsightCategory; label: string }[] = [
  { id: 'all', label: 'All Insights' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'risk', label: 'Risk' },
  { id: 'growth', label: 'Growth' },
];

export const InsightsTab: Component = () => {
  const metricsQuery = useAdminAdvancedMetrics();
  const cohortsQuery = useAdminCohorts();
  const dashboardQuery = useAdminDashboard();
  const [activeCategory, setActiveCategory] = createSignal<InsightCategory>('all');
  const [bookmarkedInsights, setBookmarkedInsights] = createSignal<string[]>([]);

  const toggleBookmark = (insightId: string) => {
    setBookmarkedInsights(prev =>
      prev.includes(insightId) ? prev.filter(id => id !== insightId) : [...prev, insightId]
    );
  };

  return (
    <div class="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="flex items-center gap-3 text-3xl font-black tracking-tight text-white">
            <Lightbulb size={32} class="text-amber-400" />
            Business Intelligence
          </h2>
          <p class="mt-2 text-sm text-slate-400">
            Advanced analytics, customer health, and growth opportunities
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            onClick={() => metricsQuery.refetch()}
            disabled={metricsQuery.isRefetching}
            class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} class={metricsQuery.isRefetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2 overflow-x-auto rounded-xl border border-white/5 bg-white/[0.02] p-1">
        <For each={INSIGHT_CATEGORIES}>
          {cat => (
            <button
              onClick={() => setActiveCategory(cat.id)}
              class={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                activeCategory() === cat.id
                  ? 'bg-white text-black'
                  : 'text-nebula-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          )}
        </For>
      </div>

      <Show when={bookmarkedInsights().length > 0}>
        <div class="border-solar-500/20 bg-solar-500/5 flex items-center gap-2 rounded-xl border px-4 py-3">
          <Bookmark size={16} class="text-solar-400" />
          <span class="text-solar-400 text-sm">
            {bookmarkedInsights().length} insights bookmarked
          </span>
        </div>
      </Show>

      <Show when={metricsQuery.isLoading}>
        <div class="grid gap-6 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </Show>

      <Show when={metricsQuery.isError}>
        <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <p class="text-lg font-bold text-rose-400">Failed to load advanced metrics</p>
          <p class="mt-2 text-sm text-slate-400">{metricsQuery.error?.message}</p>
          <button
            onClick={() => metricsQuery.refetch()}
            class="mt-4 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-600"
          >
            Try Again
          </button>
        </div>
      </Show>

      <Show when={metricsQuery.isSuccess ? metricsQuery.data : undefined}>
        {metrics => (
          <div class="space-y-8">
            <Show when={activeCategory() === 'all' || activeCategory() === 'engagement'}>
              <Show when={metrics().engagement}>
                {engagement => (
                  <div class="group relative">
                    <div class="absolute top-4 right-4 z-10 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => toggleBookmark('engagement')}
                        class={`rounded-lg p-2 transition-all ${
                          bookmarkedInsights().includes('engagement')
                            ? 'bg-solar-500/20 text-solar-400'
                            : 'bg-void-800 text-nebula-400 hover:text-white'
                        }`}
                      >
                        <Bookmark size={14} />
                      </button>
                    </div>
                    <EngagementMetrics data={engagement()} />
                  </div>
                )}
              </Show>
            </Show>

            <Show
              when={
                activeCategory() === 'all' ||
                activeCategory() === 'risk' ||
                activeCategory() === 'growth'
              }
            >
              <div class="grid gap-6 lg:grid-cols-2">
                <Show
                  when={
                    activeCategory() === 'all' || activeCategory() === 'risk'
                      ? metrics().churn_risk_segments
                      : undefined
                  }
                >
                  {segments => <ChurnRiskSegments data={segments()} />}
                </Show>
                <Show
                  when={
                    activeCategory() === 'all' || activeCategory() === 'growth'
                      ? metrics().expansion_opportunities
                      : undefined
                  }
                >
                  {opportunities => <ExpansionOpportunities data={opportunities()} />}
                </Show>
              </div>
            </Show>

            <Show when={activeCategory() === 'all' || activeCategory() === 'engagement'}>
              <Show when={metrics().time_to_value}>
                {ttv => <TimeToValueMetrics data={ttv()} />}
              </Show>
            </Show>

            <Show when={activeCategory() === 'all' || activeCategory() === 'engagement'}>
              <div class="grid gap-6 lg:grid-cols-2">
                <Show when={metrics().feature_adoption}>
                  {adoption => <FeatureAdoptionChart data={adoption()} />}
                </Show>
                <Show when={metrics().command_heatmap}>
                  {heatmap => <CommandHeatmap data={heatmap()} />}
                </Show>
              </div>
            </Show>

            <Show when={activeCategory() === 'all' || activeCategory() === 'engagement'}>
              <Show when={metrics().runtime_adoption}>
                {adoption => <RuntimeAdoptionChart data={adoption()} />}
              </Show>
            </Show>

            <Show when={activeCategory() === 'all' || activeCategory() === 'engagement'}>
              <Show when={cohortsQuery.isError}>
                <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
                  <p class="font-bold text-rose-400">Failed to load cohort insights</p>
                  <p class="mt-2 text-sm text-slate-400">{cohortsQuery.error?.message}</p>
                  <button
                    onClick={() => cohortsQuery.refetch()}
                    class="mt-4 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-600"
                  >
                    Try Again
                  </button>
                </div>
              </Show>
              <Show when={cohortsQuery.isSuccess ? cohortsQuery.data?.cohorts : undefined}>
                {cohorts => (
                  <CohortRetentionHeatmap
                    data={cohorts().map(c => ({
                      cohort_month: c.cohort_week,
                      month_index: c.weeks_since_signup,
                      active_users: c.active_users,
                    }))}
                    maxMonths={12}
                  />
                )}
              </Show>
            </Show>

            <Show when={activeCategory() === 'all' || activeCategory() === 'growth'}>
              <Show when={dashboardQuery.isError}>
                <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
                  <p class="font-bold text-rose-400">Failed to load geographic insights</p>
                  <p class="mt-2 text-sm text-slate-400">{dashboardQuery.error?.message}</p>
                  <button
                    onClick={() => dashboardQuery.refetch()}
                    class="mt-4 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-600"
                  >
                    Try Again
                  </button>
                </div>
              </Show>
              <Show
                when={dashboardQuery.isSuccess ? dashboardQuery.data?.geo_distribution : undefined}
              >
                {geo => (
                  <GeoDistribution
                    data={geo().map(g => ({
                      country_code: g.dimension,
                      user_count: g.count,
                    }))}
                    maxItems={10}
                  />
                )}
              </Show>
            </Show>

            <div class="rounded-3xl border border-white/5 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 p-8">
              <h3 class="mb-4 text-xl font-bold text-white">Key Insights Summary</h3>
              <div class="grid gap-4 md:grid-cols-3">
                <div class="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p class="text-xs text-slate-400">Current MRR</p>
                  <p class="mt-1 text-2xl font-black text-emerald-400">
                    ${(metrics().revenue_metrics?.current_mrr || 0).toLocaleString()}
                  </p>
                  <p class="mt-1 text-xs text-slate-500">
                    ${(metrics().revenue_metrics?.projected_arr || 0).toLocaleString()} ARR
                  </p>
                </div>

                <div class="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p class="text-xs text-slate-400">Expansion MRR (12m)</p>
                  <p class="mt-1 text-2xl font-black text-indigo-400">
                    ${(metrics().revenue_metrics?.expansion_mrr_12m || 0).toLocaleString()}
                  </p>
                  <p class="mt-1 text-xs text-slate-500">New revenue from upgrades</p>
                </div>

                <div class="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p class="text-xs text-slate-400">Product Stickiness</p>
                  <p class="mt-1 text-2xl font-black text-purple-400">
                    {metrics().retention?.product_stickiness?.daily_active_pct?.toFixed(1) || 0}%
                  </p>
                  <p class="mt-1 text-xs text-slate-500">Daily active users</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
