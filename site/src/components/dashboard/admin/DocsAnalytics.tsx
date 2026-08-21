import type { Component } from 'solid-js';
import { createSignal, createEffect, Show, For } from 'solid-js';
import { ChartLine, ChartColumn, Globe, MousePointerClick, Zap, ExternalLink } from 'lucide-solid';
import * as api from '../../../lib/api';

function formatNumber(num: number) {
  return new Intl.NumberFormat().format(num);
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export const DocsAnalytics: Component = () => {
  const [data, setData] = createSignal<api.DocsAnalyticsDashboard | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [period, setPeriod] = createSignal(30);
  const [error, setError] = createSignal('');

  createEffect(async () => {
    setLoading(true);
    setError('');
    try {
      const analytics = await api.getDocsAnalytics(period());
      setData(analytics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load docs analytics');
    } finally {
      setLoading(false);
    }
  });

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-2xl font-bold text-transparent">
            📚 Docs Analytics
          </h2>
          <p class="mt-1 text-sm text-slate-400">Web analytics for omg-docs.pages.dev</p>
        </div>

        {/* Period Selector */}
        <div class="flex gap-2">
          <button
            onClick={() => setPeriod(7)}
            class={`rounded-lg px-3 py-1.5 text-sm transition-all ${
              period() === 7
                ? 'border border-indigo-500/30 bg-indigo-500/20 text-indigo-400'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            7 days
          </button>
          <button
            onClick={() => setPeriod(30)}
            class={`rounded-lg px-3 py-1.5 text-sm transition-all ${
              period() === 30
                ? 'border border-indigo-500/30 bg-indigo-500/20 text-indigo-400'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            30 days
          </button>
          <button
            onClick={() => setPeriod(90)}
            class={`rounded-lg px-3 py-1.5 text-sm transition-all ${
              period() === 90
                ? 'border border-indigo-500/30 bg-indigo-500/20 text-indigo-400'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            90 days
          </button>
        </div>
      </div>

      <Show when={error()}>
        <div class="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div class="py-12 text-center text-slate-400">Loading analytics...</div>
      </Show>

      <Show when={!loading() && data()}>
        <div class="space-y-6">
          {/* Summary Stats */}
          <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div class="rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-6">
              <div class="mb-2 flex items-center gap-3">
                <ChartColumn size={20} class="text-indigo-400" />
                <span class="text-sm text-slate-400">Total Pageviews</span>
              </div>
              <div class="text-3xl font-bold text-white">
                {formatNumber(data()?.summary.total_pageviews || 0)}
              </div>
            </div>

            <div class="rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 p-6">
              <div class="mb-2 flex items-center gap-3">
                <Globe size={20} class="text-cyan-400" />
                <span class="text-sm text-slate-400">Total Sessions</span>
              </div>
              <div class="text-3xl font-bold text-white">
                {formatNumber(data()?.summary.total_sessions || 0)}
              </div>
            </div>

            <div class="rounded-xl border border-white/10 bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-6">
              <div class="mb-2 flex items-center gap-3">
                <ChartLine size={20} class="text-purple-400" />
                <span class="text-sm text-slate-400">Pages/Session</span>
              </div>
              <div class="text-3xl font-bold text-white">
                {data()?.summary.avg_pages_per_session || '0'}
              </div>
            </div>

            <div class="rounded-xl border border-white/10 bg-gradient-to-br from-green-500/10 to-emerald-500/10 p-6">
              <div class="mb-2 flex items-center gap-3">
                <Zap size={20} class="text-green-400" />
                <span class="text-sm text-slate-400">Period</span>
              </div>
              <div class="text-3xl font-bold text-white">
                {data()?.summary.period_days || 0} days
              </div>
            </div>
          </div>

          {/* Top Pages */}
          <div class="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
              <ChartColumn size={20} class="text-indigo-400" />
              Top Pages
            </h3>
            <div class="space-y-2">
              <For each={data()?.top_pages.slice(0, 10)}>
                {(page, index) => (
                  <div class="flex items-center justify-between rounded-lg bg-white/5 p-3 transition-colors hover:bg-white/10">
                    <div class="flex flex-1 items-center gap-3">
                      <span class="w-6 text-sm text-slate-500">{index() + 1}</span>
                      <span class="font-mono text-sm text-white">{page.path}</span>
                    </div>
                    <div class="flex items-center gap-6 text-sm">
                      <div class="text-right">
                        <div class="text-white">{formatNumber(page.views)}</div>
                        <div class="text-xs text-slate-400">views</div>
                      </div>
                      <div class="text-right">
                        <div class="text-cyan-400">{formatNumber(page.sessions)}</div>
                        <div class="text-xs text-slate-400">sessions</div>
                      </div>
                      <div class="w-20 text-right">
                        <div class="text-purple-400">{formatDuration(page.avg_time)}</div>
                        <div class="text-xs text-slate-400">avg time</div>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Two Column Layout */}
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Top Referrers */}
            <div class="rounded-xl border border-white/10 bg-white/5 p-6">
              <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                <ExternalLink size={20} class="text-cyan-400" />
                Top Referrers
              </h3>
              <div class="space-y-2">
                <For each={data()?.top_referrers.slice(0, 5)}>
                  {ref => (
                    <div class="flex items-center justify-between rounded-lg bg-white/5 p-3">
                      <span class="mr-4 flex-1 truncate text-sm text-white">
                        {ref.referrer === 'direct' ? '🔗 Direct' : ref.referrer}
                      </span>
                      <div class="flex items-center gap-4 text-sm">
                        <div class="text-right">
                          <div class="text-cyan-400">{formatNumber(ref.sessions)}</div>
                          <div class="text-xs text-slate-400">sessions</div>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* UTM Campaigns */}
            <div class="rounded-xl border border-white/10 bg-white/5 p-6">
              <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                <ChartLine size={20} class="text-purple-400" />
                UTM Campaigns
              </h3>
              <div class="space-y-2">
                <Show when={data()?.utm_campaigns.length === 0}>
                  <div class="py-4 text-center text-sm text-slate-400">
                    No UTM campaign data yet
                  </div>
                </Show>
                <For each={data()?.utm_campaigns.slice(0, 5)}>
                  {campaign => (
                    <div class="rounded-lg bg-white/5 p-3">
                      <div class="mb-1 flex items-center justify-between">
                        <span class="text-sm font-medium text-white">
                          {campaign.utm_campaign || 'Unnamed Campaign'}
                        </span>
                        <span class="text-sm text-cyan-400">
                          {formatNumber(campaign.sessions)} sessions
                        </span>
                      </div>
                      <div class="text-xs text-slate-400">
                        {campaign.utm_source} / {campaign.utm_medium}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Geographic Distribution */}
            <div class="rounded-xl border border-white/10 bg-white/5 p-6">
              <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                <Globe size={20} class="text-green-400" />
                Geographic Distribution
              </h3>
              <div class="space-y-2">
                <For each={data()?.geographic.slice(0, 8)}>
                  {geo => (
                    <div class="flex items-center justify-between rounded-lg bg-white/5 p-3">
                      <span class="text-sm text-white">
                        {geo.country_code === 'unknown' ? '🌍 Unknown' : `🌍 ${geo.country_code}`}
                      </span>
                      <div class="flex items-center gap-4 text-sm">
                        <div class="text-right">
                          <div class="text-green-400">{formatNumber(geo.sessions)}</div>
                          <div class="text-xs text-slate-400">sessions</div>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Top Interactions */}
            <div class="rounded-xl border border-white/10 bg-white/5 p-6">
              <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                <MousePointerClick size={20} class="text-orange-400" />
                Top Interactions
              </h3>
              <div class="space-y-2">
                <Show when={data()?.top_interactions.length === 0}>
                  <div class="py-4 text-center text-sm text-slate-400">No interaction data yet</div>
                </Show>
                <For each={data()?.top_interactions.slice(0, 8)}>
                  {interaction => (
                    <div class="flex items-center justify-between rounded-lg bg-white/5 p-3">
                      <div class="flex-1">
                        <div class="text-sm font-medium text-white">{interaction.target}</div>
                        <div class="text-xs text-slate-400">{interaction.interaction_type}</div>
                      </div>
                      <div class="font-semibold text-orange-400">
                        {formatNumber(interaction.count)}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div class="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
              <Zap size={20} class="text-yellow-400" />
              Performance Metrics
            </h3>
            <div class="space-y-2">
              <For each={data()?.performance.slice(0, 5)}>
                {perf => (
                  <div class="flex items-center justify-between rounded-lg bg-white/5 p-3">
                    <span class="flex-1 font-mono text-sm text-white">{perf.path}</span>
                    <div class="flex items-center gap-6 text-sm">
                      <div class="text-right">
                        <div class="text-green-400">{perf.avg_load}ms</div>
                        <div class="text-xs text-slate-400">avg load</div>
                      </div>
                      <div class="text-right">
                        <div class="text-yellow-400">{perf.p95_load}ms</div>
                        <div class="text-xs text-slate-400">p95</div>
                      </div>
                      <div class="text-right">
                        <div class="text-slate-400">{formatNumber(perf.samples)}</div>
                        <div class="text-xs text-slate-400">samples</div>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
