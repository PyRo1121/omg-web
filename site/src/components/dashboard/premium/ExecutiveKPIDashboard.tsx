import type { Component } from 'solid-js';
import { createMemo, For, Show } from 'solid-js';
import { Sparkline } from '../../../design-system/components/Charts';
import type { AdvancedMetrics, ExecutiveKPI } from './types';

interface ExecutiveKPIDashboardProps {
  kpi: ExecutiveKPI;
  metrics?: AdvancedMetrics | undefined;
  isLoading?: boolean | undefined;
  mrrHistory?: number[] | undefined;
  dauHistory?: number[] | undefined;
  onDrillDown?: ((metric: string) => void) | undefined;
  compareMode?: boolean | undefined;
  previousKpi?: ExecutiveKPI | undefined;
  mrrTarget?: number | undefined;
  dauTarget?: number | undefined;
}

interface MetricDefinition {
  id: string;
  label: string;
  value: string;
  detail: string;
  change?: number | undefined;
  history?: number[] | undefined;
  previous?: string | undefined;
  target?: number | undefined;
  current: number;
}

const compactNumber = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const currency = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const progress = (value: number, target: number | undefined): number | undefined => {
  if (target === undefined || target <= 0) {
    return undefined;
  }
  return Math.min(100, Math.max(0, (value / target) * 100));
};

export const ExecutiveKPIDashboard: Component<ExecutiveKPIDashboardProps> = props => {
  const metrics = createMemo<MetricDefinition[]>(() => [
    {
      id: 'mrr',
      label: 'Monthly recurring revenue',
      value: currency.format(props.kpi.mrr),
      detail: `${currency.format(props.kpi.arr)} ARR`,
      change: props.kpi.mrr_change,
      history: props.mrrHistory,
      previous: props.compareMode ? currency.format(props.previousKpi?.mrr ?? 0) : undefined,
      target: props.mrrTarget,
      current: props.kpi.mrr,
    },
    {
      id: 'dau',
      label: 'Daily active users',
      value: compactNumber.format(props.kpi.dau),
      detail: `${props.kpi.mau > 0 ? ((props.kpi.dau / props.kpi.mau) * 100).toFixed(1) : '0.0'}% of MAU`,
      history: props.dauHistory,
      previous: props.compareMode ? compactNumber.format(props.previousKpi?.dau ?? 0) : undefined,
      target: props.dauTarget,
      current: props.kpi.dau,
    },
    {
      id: 'churn',
      label: 'Churn rate',
      value: `${props.kpi.churn_rate.toFixed(1)}%`,
      detail: `${props.kpi.at_risk_count.toLocaleString()} accounts at risk`,
      previous: props.compareMode
        ? `${(props.previousKpi?.churn_rate ?? 0).toFixed(1)}%`
        : undefined,
      current: props.kpi.churn_rate,
    },
    {
      id: 'expansion',
      label: 'Expansion pipeline',
      value: currency.format(props.kpi.expansion_pipeline),
      detail: `${props.metrics?.expansion_opportunities.length ?? 0} qualified opportunities`,
      previous: props.compareMode
        ? currency.format(props.previousKpi?.expansion_pipeline ?? 0)
        : undefined,
      current: props.kpi.expansion_pipeline,
    },
  ]);

  const dailyToMonthly = createMemo(() =>
    props.kpi.mau > 0 ? (props.kpi.dau / props.kpi.mau) * 100 : 0
  );
  const dailyToWeekly = createMemo(() =>
    props.kpi.wau > 0 ? (props.kpi.dau / props.kpi.wau) * 100 : 0
  );

  return (
    <section
      aria-labelledby="executive-title"
      class="border border-[var(--ink)] bg-[var(--paper-raised)]"
    >
      <header class="flex items-end justify-between border-b border-[var(--ink)] p-5">
        <div>
          <p class="manifest-index">EXECUTIVE INDEX</p>
          <h2 id="executive-title" class="mt-2 text-2xl font-black tracking-[-0.04em] uppercase">
            Operating position
          </h2>
        </div>
        <span class="manifest-label text-[var(--ink-muted)]">Current period</span>
      </header>

      <Show
        when={!props.isLoading}
        fallback={
          <div class="grid divide-y divide-[var(--rule)] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
            <For each={[1, 2, 3, 4]}>
              {() => <div class="h-40 animate-pulse bg-[rgba(21,21,20,0.035)]" />}
            </For>
          </div>
        }
      >
        <dl class="m-0 grid md:grid-cols-2 xl:grid-cols-4">
          <For each={metrics()}>
            {metric => {
              const targetProgress = progress(metric.current, metric.target);
              return (
                <div class="group border-b border-[var(--rule)] p-5 md:border-r xl:border-b-0 xl:last:border-r-0">
                  <dt class="manifest-label text-[var(--ink-muted)]">{metric.label}</dt>
                  <dd class="m-0">
                    <button
                      type="button"
                      class="mt-5 block text-left"
                      onClick={() => props.onDrillDown?.(metric.id)}
                      disabled={props.onDrillDown === undefined}
                    >
                      <data class="text-4xl font-semibold tracking-[-0.055em] group-hover:text-[var(--signal)]">
                        {metric.value}
                      </data>
                    </button>
                    <div class="mt-2 flex min-h-7 items-center justify-between gap-3 font-mono text-[10px] text-[var(--ink-muted)]">
                      <span>{metric.detail}</span>
                      <Show when={metric.change !== undefined}>
                        <span
                          class={
                            metric.change !== undefined && metric.change >= 0
                              ? 'text-emerald-700'
                              : 'text-red-700'
                          }
                        >
                          {metric.change !== undefined && metric.change > 0 ? '+' : ''}
                          {metric.change?.toFixed(1)}%
                        </span>
                      </Show>
                    </div>
                    <Show
                      when={
                        metric.history && metric.history.length > 1 ? metric.history : undefined
                      }
                    >
                      {history => (
                        <div class="mt-4">
                          <Sparkline data={history()} color="#e33a28" width={120} height={28} />
                        </div>
                      )}
                    </Show>
                    <Show when={metric.previous}>
                      <p class="mt-3 font-mono text-[10px] text-[var(--ink-muted)]">
                        Previous: {metric.previous}
                      </p>
                    </Show>
                    <Show when={targetProgress !== undefined}>
                      <div class="mt-4 h-1 bg-[var(--paper-muted)]">
                        <div
                          class="h-full bg-[var(--signal)]"
                          style={{ width: `${targetProgress}%` }}
                        />
                      </div>
                    </Show>
                  </dd>
                </div>
              );
            }}
          </For>
        </dl>
      </Show>

      <div class="grid border-t border-[var(--ink)] lg:grid-cols-[1fr_1.4fr]">
        <section
          class="border-b border-[var(--ink)] p-5 lg:border-r lg:border-b-0"
          aria-labelledby="engagement-title"
        >
          <h3 id="engagement-title" class="manifest-label text-[var(--ink-muted)]">
            Engagement ratios
          </h3>
          <dl class="mt-5 grid grid-cols-3 border border-[var(--rule)]">
            <div class="border-r border-[var(--rule)] p-4">
              <dt class="manifest-label text-[var(--ink-muted)]">DAU</dt>
              <dd class="m-0 mt-2 font-mono text-xl">{props.kpi.dau.toLocaleString()}</dd>
            </div>
            <div class="border-r border-[var(--rule)] p-4">
              <dt class="manifest-label text-[var(--ink-muted)]">WAU</dt>
              <dd class="m-0 mt-2 font-mono text-xl">{props.kpi.wau.toLocaleString()}</dd>
            </div>
            <div class="p-4">
              <dt class="manifest-label text-[var(--ink-muted)]">MAU</dt>
              <dd class="m-0 mt-2 font-mono text-xl">{props.kpi.mau.toLocaleString()}</dd>
            </div>
          </dl>
          <div class="mt-5 space-y-3 font-mono text-xs">
            <div class="flex justify-between border-b border-[var(--rule)] pb-3">
              <span>DAU / MAU</span>
              <strong>{dailyToMonthly().toFixed(1)}%</strong>
            </div>
            <div class="flex justify-between">
              <span>DAU / WAU</span>
              <strong>{dailyToWeekly().toFixed(1)}%</strong>
            </div>
          </div>
        </section>

        <section class="p-5" aria-labelledby="risk-title">
          <div class="grid gap-7 md:grid-cols-2">
            <div>
              <h3 id="risk-title" class="manifest-label text-[var(--ink-muted)]">
                Churn segments
              </h3>
              <div class="mt-4 divide-y divide-[var(--rule)] border-y border-[var(--rule)] font-mono text-xs">
                <For
                  each={props.metrics?.churn_risk_segments ?? []}
                  fallback={<p class="py-4 text-[var(--ink-muted)]">No segment data</p>}
                >
                  {segment => (
                    <div class="flex justify-between py-3">
                      <span class="capitalize">
                        {segment.risk_segment} / {segment.tier}
                      </span>
                      <strong>{segment.user_count}</strong>
                    </div>
                  )}
                </For>
              </div>
            </div>
            <div>
              <h3 class="manifest-label text-[var(--ink-muted)]">Expansion queue</h3>
              <div class="mt-4 divide-y divide-[var(--rule)] border-y border-[var(--rule)] font-mono text-xs">
                <For
                  each={(props.metrics?.expansion_opportunities ?? []).slice(0, 5)}
                  fallback={<p class="py-4 text-[var(--ink-muted)]">No queued opportunities</p>}
                >
                  {opportunity => (
                    <div class="grid grid-cols-[1fr_auto] gap-3 py-3">
                      <span class="truncate">{opportunity.email}</span>
                      <strong class="uppercase">{opportunity.priority}</strong>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};
