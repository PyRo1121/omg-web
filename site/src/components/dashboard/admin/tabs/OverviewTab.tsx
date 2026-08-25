import type { Component } from 'solid-js';
import { Show, For } from 'solid-js';
import { RealTimeCommandCenter } from '../../premium';
import type { FirehoseEvent, GeoDistribution, CommandHealth } from '../../premium/types';

/**
 * Overview metrics shown on the admin overview. Every field is read directly
 * from an admin API response — no derived, projected, or placeholder values.
 */
export interface OverviewMetrics {
  readonly mrr: number | null;
  readonly dau: number | null;
  readonly wau: number | null;
  readonly mau: number | null;
  readonly atRiskCount: number | null;
}

interface OverviewTabProps {
  metrics: OverviewMetrics;
  firehoseEvents: FirehoseEvent[];
  geoDistribution: GeoDistribution[];
  commandHealth: CommandHealth;
  isMetricsLoading: boolean;
  isMetricsError: boolean;
  onRetryMetrics: () => void;
  onRefresh: () => void;
}

const METRIC_FORMAT = new Intl.NumberFormat('en-US');

interface OverviewKpiItem {
  readonly key: keyof OverviewMetrics;
  readonly label: string;
  readonly prefix?: string;
}

const KPI_ITEMS: readonly OverviewKpiItem[] = [
  { key: 'mrr', label: 'MRR', prefix: '$' },
  { key: 'dau', label: 'Daily active' },
  { key: 'wau', label: 'Weekly active' },
  { key: 'mau', label: 'Monthly active' },
  { key: 'atRiskCount', label: 'At-risk users' },
];

function formatMetric(metrics: OverviewMetrics, item: OverviewKpiItem): string {
  const value = metrics[item.key];
  return value === null ? 'No data' : `${item.prefix ?? ''}${METRIC_FORMAT.format(value)}`;
}

/** Admin overview: real KPIs plus the live command stream. */
export const OverviewTab: Component<OverviewTabProps> = props => {
  return (
    <div class="space-y-8">
      <Show when={props.isMetricsError}>
        <div role="alert" class="flex items-center justify-between gap-4 border border-red-700 p-4">
          <p class="m-0 text-sm text-[var(--ink-muted)]">Some overview metrics are unavailable.</p>
          <button type="button" class="manifest-button" onClick={props.onRetryMetrics}>
            Retry
          </button>
        </div>
      </Show>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <For each={KPI_ITEMS}>
          {item => (
            <div class="border border-[var(--rule)] bg-[var(--paper-raised)] p-5">
              <p class="text-sm text-[var(--ink-muted)]">{item.label}</p>
              <Show
                when={!props.isMetricsLoading}
                fallback={<div class="mt-2 h-8 w-20 animate-pulse bg-white/10" />}
              >
                <p class="mt-2 font-mono text-2xl font-semibold text-[var(--ink)] tabular-nums">
                  {formatMetric(props.metrics, item)}
                </p>
              </Show>
            </div>
          )}
        </For>
      </div>

      <RealTimeCommandCenter
        events={props.firehoseEvents}
        geoDistribution={props.geoDistribution}
        commandHealth={props.commandHealth}
        isLive={true}
        onRefresh={props.onRefresh}
      />
    </div>
  );
};
