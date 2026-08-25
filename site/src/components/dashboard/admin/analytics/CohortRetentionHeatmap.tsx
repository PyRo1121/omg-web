import { type Component, For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Calendar, Users, TrendingUp, Info, Maximize2, Minimize2 } from 'lucide-solid';
import { cn } from '~/lib/prelude';

interface CohortData {
  /** Period the cohort signed up in (e.g. `2026-08` for months, `2026-08-05` for weeks). */
  cohort_period: string;
  period_index: number;
  active_users: number;
  retention_rate?: number;
}

interface CohortRetentionHeatmapProps {
  data: CohortData[];
  /** Label for the elapsed-period axis (e.g. `Month`, `Week`). */
  periodUnit?: 'Month' | 'Week';
  maxPeriods?: number;
}

const RETENTION_COLORS = [
  { min: 0, bg: 'rgba(239, 68, 68, 0.7)', glow: 'rgba(239, 68, 68, 0.3)', label: 'Critical' },
  { min: 10, bg: 'rgba(245, 158, 11, 0.6)', glow: 'rgba(245, 158, 11, 0.3)', label: 'Poor' },
  { min: 25, bg: 'rgba(251, 191, 36, 0.6)', glow: 'rgba(251, 191, 36, 0.3)', label: 'Fair' },
  { min: 40, bg: 'rgba(34, 197, 94, 0.5)', glow: 'rgba(34, 197, 94, 0.25)', label: 'Good' },
  { min: 60, bg: 'rgba(34, 197, 94, 0.65)', glow: 'rgba(34, 197, 94, 0.3)', label: 'Great' },
  { min: 80, bg: 'rgba(16, 185, 129, 0.8)', glow: 'rgba(16, 185, 129, 0.4)', label: 'Excellent' },
] as const;

function getRetentionColor(rate: number) {
  for (let i = RETENTION_COLORS.length - 1; i >= 0; i--) {
    const color = RETENTION_COLORS[i];
    if (color !== undefined && rate >= color.min) {
      return color;
    }
  }
  return RETENTION_COLORS[0];
}

/**
 * Format a cohort period for display. Monthly periods are `YYYY-MM`; weekly
 * periods are full dates. Appending `-01` to a weekly date would produce an
 * invalid value, so full dates are parsed as-is.
 */
function formatCohortPeriod(period: string): string {
  const date = new Date(period.length === 7 ? `${period}-01` : period);
  if (Number.isNaN(date.getTime())) {
    return period;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

/** Render an average retention rate as `NN%`, or `-` when no data exists. */
function formatAvgRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) {
    return '-';
  }
  return `${rate}%`;
}

export const CohortRetentionHeatmap: Component<CohortRetentionHeatmapProps> = props => {
  const [mounted, setMounted] = createSignal(false);
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [hoveredCell, setHoveredCell] = createSignal<{ cohort: string; period: number } | null>(
    null
  );

  onMount(() => {
    const animationFrame = requestAnimationFrame(() => setMounted(true));
    onCleanup(() => cancelAnimationFrame(animationFrame));
  });

  const maxPeriods = () => props.maxPeriods ?? 12;
  const periodUnitLabel = () => (props.periodUnit ?? 'Month').charAt(0);

  const periodIndices = createMemo(() => Array.from({ length: maxPeriods() + 1 }, (_, i) => i));

  const cohortMap = createMemo(() => {
    const groupedByPeriod = new Map<string, Map<number, CohortData>>();

    for (const item of props.data) {
      const existing = groupedByPeriod.get(item.cohort_period);
      if (existing === undefined) {
        groupedByPeriod.set(item.cohort_period, new Map([[item.period_index, item]]));
      } else {
        existing.set(item.period_index, item);
      }
    }

    return Array.from(groupedByPeriod.entries())
      .toSorted((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12);
  });

  const cohortLookup = createMemo(() => new Map(cohortMap()));

  const getRetentionRate = (cohortPeriod: string, periodIndex: number) => {
    const cohort = cohortLookup().get(cohortPeriod);
    if (!cohort) {
      return null;
    }

    const periodData = cohort.get(periodIndex);
    const basePeriod = cohort.get(0);

    if (!periodData || !basePeriod || basePeriod.active_users === 0) {
      return null;
    }

    const retentionRate =
      periodData.retention_rate ?? (periodData.active_users / basePeriod.active_users) * 100;
    return Math.round(retentionRate);
  };

  const getActiveUsers = (cohortPeriod: string, periodIndex: number) => {
    return cohortLookup().get(cohortPeriod)?.get(periodIndex)?.active_users ?? null;
  };

  const getBaseUsers = (cohortPeriod: string) => {
    return cohortLookup().get(cohortPeriod)?.get(0)?.active_users ?? 0;
  };

  const avgRetentionByPeriod = createMemo(() => {
    const totals: number[] = [];
    const counts: number[] = [];

    for (let i = 0; i <= maxPeriods(); i++) {
      totals[i] = 0;
      counts[i] = 0;
    }

    for (const [cohortPeriod] of cohortMap()) {
      for (let i = 0; i <= maxPeriods(); i++) {
        const rate = getRetentionRate(cohortPeriod, i);
        if (rate !== null) {
          totals[i] = (totals[i] ?? 0) + rate;
          counts[i] = (counts[i] ?? 0) + 1;
        }
      }
    }

    return totals.map((total, i) => {
      const count = counts[i] ?? 0;
      return count > 0 ? Math.round(total / count) : null;
    });
  });

  const overallHealth = createMemo(() => {
    const period3Avg = avgRetentionByPeriod()[3];
    if (period3Avg === undefined || period3Avg === null) {
      return { label: 'N/A', color: 'var(--color-nebula-400)' };
    }
    if (period3Avg >= 60) {
      return { label: 'Excellent', color: 'var(--color-aurora-400)' };
    }
    if (period3Avg >= 40) {
      return { label: 'Good', color: 'var(--color-electric-400)' };
    }
    if (period3Avg >= 25) {
      return { label: 'Fair', color: 'var(--color-solar-400)' };
    }
    return { label: 'Needs Work', color: 'var(--color-flare-400)' };
  });

  return (
    <div
      class={cn(
        'bg-void-900 relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 shadow-2xl',
        'transition-all duration-300',
        isExpanded() && 'col-span-full'
      )}
    >
      <div
        class="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-10 blur-3xl transition-opacity duration-500"
        style={{ background: overallHealth().color }}
      />

      <div class="relative mb-6 flex items-start justify-between">
        <div>
          <div class="mb-1 flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-photon-600), var(--color-photon-400))',
                'box-shadow': '0 0 15px rgba(176, 109, 232, 0.3)',
              }}
            >
              <Calendar size={20} class="text-white" />
            </div>
            <div>
              <h3 class="text-nebula-100 text-lg font-bold tracking-tight">Cohort Retention</h3>
              <p class="text-nebula-500 text-xs">
                <span class="text-nebula-300 font-bold">{cohortMap().length}</span> cohorts •
                {props.periodUnit ?? 'Month'}ly retention tracking
              </p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div
            class="rounded-full border px-3 py-1.5 text-xs font-bold"
            style={{
              color: overallHealth().color,
              'background-color': `color-mix(in srgb, ${overallHealth().color} 10%, transparent)`,
              'border-color': `color-mix(in srgb, ${overallHealth().color} 20%, transparent)`,
            }}
          >
            {overallHealth().label}
          </div>
          <button
            type="button"
            aria-label={isExpanded() ? 'Collapse cohort heatmap' : 'Expand cohort heatmap'}
            aria-expanded={isExpanded()}
            onClick={() => setIsExpanded(!isExpanded())}
            class={cn(
              'bg-void-800/50 rounded-xl border border-white/[0.06] p-2',
              'text-nebula-400 hover:text-nebula-200',
              'hover:bg-void-750/50 transition-all duration-200 hover:border-white/10'
            )}
          >
            {isExpanded() ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <Show when={cohortMap().length === 0}>
        <div class="flex flex-col items-center justify-center py-12">
          <div class="bg-void-800 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <Calendar size={32} class="text-nebula-600" />
          </div>
          <p class="text-nebula-200 text-lg font-bold">No Cohort Data</p>
          <p class="text-nebula-500 mt-1 text-sm">Retention data will appear once users sign up</p>
        </div>
      </Show>

      <Show when={cohortMap().length > 0}>
        <div
          class={cn(
            'overflow-x-auto transition-all duration-500',
            mounted() ? 'opacity-100' : 'opacity-0'
          )}
        >
          <table class="w-full border-collapse">
            <thead>
              <tr>
                <th class="bg-void-900 text-nebula-500 sticky left-0 z-10 px-3 py-2 text-left text-xs font-bold tracking-wider uppercase">
                  Cohort
                </th>
                <th class="bg-void-900 text-nebula-500 sticky left-[100px] z-10 px-2 py-2 text-center text-xs font-bold">
                  Users
                </th>
                <For each={periodIndices()}>
                  {period => (
                    <th
                      class={cn(
                        'px-1 py-2 text-center text-xs font-bold transition-colors',
                        hoveredCell()?.period === period ? 'text-nebula-200' : 'text-nebula-600'
                      )}
                    >
                      {periodUnitLabel()}
                      {period}
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={cohortMap()}>
                {([cohortPeriod], rowIndex) => (
                  <tr
                    class={cn(
                      'transition-colors duration-200',
                      hoveredCell()?.cohort === cohortPeriod && 'bg-white/[0.02]'
                    )}
                  >
                    <td class="bg-void-900 sticky left-0 z-10 px-3 py-1.5">
                      <span class="text-nebula-200 text-sm font-bold">
                        {formatCohortPeriod(cohortPeriod)}
                      </span>
                    </td>
                    <td class="bg-void-900 sticky left-[100px] z-10 px-2 py-1.5 text-center">
                      <span class="text-nebula-400 font-mono text-xs tabular-nums">
                        {getBaseUsers(cohortPeriod).toLocaleString()}
                      </span>
                    </td>
                    <For each={periodIndices()}>
                      {periodIndex => {
                        const rate = getRetentionRate(cohortPeriod, periodIndex);
                        const users = getActiveUsers(cohortPeriod, periodIndex);
                        const colors = rate === null ? null : getRetentionColor(rate);
                        const isHovered =
                          hoveredCell()?.cohort === cohortPeriod &&
                          hoveredCell()?.period === periodIndex;

                        return (
                          <td class="px-1 py-1.5">
                            <Show
                              when={rate !== null}
                              fallback={
                                <div class="bg-void-800/30 flex h-8 w-10 items-center justify-center rounded">
                                  <span class="text-nebula-700 text-[10px]">-</span>
                                </div>
                              }
                            >
                              <div
                                class={cn(
                                  'group relative h-8 w-10 cursor-pointer rounded',
                                  'transition-all duration-200',
                                  'hover:z-20 hover:scale-110',
                                  isHovered && 'z-20 scale-110'
                                )}
                                style={{
                                  background: colors?.bg,
                                  'box-shadow': isHovered ? `0 0 12px ${colors?.glow}` : undefined,
                                  'animation-delay': `${(rowIndex() * (maxPeriods() + 1) + periodIndex) * 20}ms`,
                                }}
                                onMouseEnter={() =>
                                  setHoveredCell({ cohort: cohortPeriod, period: periodIndex })
                                }
                                onMouseLeave={() => setHoveredCell(null)}
                              >
                                <div class="absolute inset-0 flex items-center justify-center">
                                  <span class="text-[11px] font-bold text-white/90 tabular-nums">
                                    {rate}%
                                  </span>
                                  <span class="sr-only">
                                    {props.periodUnit ?? 'Month'} {periodIndex} retention {rate}%,{' '}
                                    {users?.toLocaleString()} active users
                                  </span>
                                </div>

                                <div
                                  class={cn(
                                    'pointer-events-none absolute top-full left-1/2 z-30 mt-2 -translate-x-1/2',
                                    'rounded-xl border border-white/10 px-3 py-2 whitespace-nowrap',
                                    'text-xs shadow-xl backdrop-blur-sm',
                                    'scale-95 opacity-0 transition-all duration-150',
                                    'group-hover:scale-100 group-hover:opacity-100'
                                  )}
                                  style={{
                                    background: 'var(--bg-overlay, rgba(10, 10, 11, 0.95))',
                                  }}
                                >
                                  <div class="text-nebula-400 mb-1">
                                    {formatCohortPeriod(cohortPeriod)} →{' '}
                                    {props.periodUnit ?? 'Month'} {periodIndex}
                                  </div>
                                  <div class="flex items-center gap-3">
                                    <div>
                                      <div class="text-nebula-500 text-[10px]">Retention</div>
                                      <div class="text-sm font-bold" style={{ color: colors?.bg }}>
                                        {rate}%
                                      </div>
                                    </div>
                                    <div class="h-6 w-px bg-white/10" />
                                    <div>
                                      <div class="text-nebula-500 text-[10px]">Active</div>
                                      <div class="text-nebula-200 text-sm font-bold">
                                        {users?.toLocaleString()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Show>
                          </td>
                        );
                      }}
                    </For>
                  </tr>
                )}
              </For>

              <tr class="border-t border-white/[0.06]">
                <td class="bg-void-900 sticky left-0 z-10 px-3 py-2">
                  <span class="text-nebula-500 text-xs font-bold tracking-wider uppercase">
                    Avg
                  </span>
                </td>
                <td class="bg-void-900 sticky left-[100px] z-10 px-2 py-2" />
                <For each={avgRetentionByPeriod()}>
                  {avgRate => {
                    const colors = avgRate === null ? null : getRetentionColor(avgRate);
                    return (
                      <td class="px-1 py-2">
                        <Show when={avgRate !== null} fallback={<div class="h-6 w-10" />}>
                          <div
                            class="flex h-6 w-10 items-center justify-center rounded"
                            style={{
                              background: `color-mix(in srgb, ${colors?.bg} 50%, transparent)`,
                            }}
                          >
                            <span
                              class="text-[10px] font-bold tabular-nums"
                              style={{ color: colors?.bg }}
                            >
                              {avgRate}%
                            </span>
                          </div>
                        </Show>
                      </td>
                    );
                  }}
                </For>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bg-void-800/30 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-4">
          <div class="flex items-center gap-4">
            <div class="text-nebula-500 flex items-center gap-2 text-xs">
              <span>Retention:</span>
            </div>
            <div class="flex items-center gap-1">
              <For each={RETENTION_COLORS}>
                {color => (
                  <div
                    class="group relative h-4 w-6 cursor-help rounded transition-transform hover:scale-110"
                    style={{ background: color.bg }}
                  >
                    <div class="text-nebula-400 bg-void-900 pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded border border-white/10 px-2 py-1 text-[10px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
                      {color.min}%+ {color.label}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="flex items-center gap-4 text-xs">
            <div class="flex items-center gap-2">
              <TrendingUp size={14} class="text-aurora-400" />
              <span class="text-nebula-400">
                {props.periodUnit ?? 'Month'} 3 Avg:{' '}
                <span class="text-nebula-200 font-bold">
                  {formatAvgRate(avgRetentionByPeriod()[3])}
                </span>
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Users size={14} class="text-indigo-400" />
              <span class="text-nebula-400">
                {props.periodUnit ?? 'Month'} 6 Avg:{' '}
                <span class="text-nebula-200 font-bold">
                  {formatAvgRate(avgRetentionByPeriod()[6])}
                </span>
              </span>
            </div>
          </div>
        </div>

        <Show when={avgRetentionByPeriod()[1] !== null}>
          <div
            class={cn(
              'mt-4 rounded-xl border p-4 transition-all duration-500',
              mounted() ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            )}
            style={{
              background: `color-mix(in srgb, ${overallHealth().color} 5%, transparent)`,
              'border-color': `color-mix(in srgb, ${overallHealth().color} 20%, transparent)`,
            }}
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: `color-mix(in srgb, ${overallHealth().color} 15%, transparent)`,
                }}
              >
                <Info size={14} style={{ color: overallHealth().color }} />
              </div>
              <div>
                <p class="text-nebula-100 text-sm font-semibold">Retention Insight</p>
                <p class="text-nebula-400 mt-0.5 text-xs leading-relaxed">
                  {(() => {
                    const period3 = avgRetentionByPeriod()[3] ?? 0;
                    if (period3 >= 50) {
                      return 'Strong retention! Your product has good stickiness. Focus on converting more trial users.';
                    }
                    if (period3 >= 30) {
                      return 'Moderate retention. Consider improving onboarding and feature discovery to boost engagement.';
                    }
                    return 'Retention needs attention. Prioritize understanding why users churn and improving first-week experience.';
                  })()}
                </p>
              </div>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default CohortRetentionHeatmap;
