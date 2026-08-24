import { type Component, For, Show, createSignal, createMemo } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  TriangleAlert,
  TrendingUp,
  Bell,
  Brain,
  Activity,
  RefreshCw,
  Shield,
  Target,
} from 'lucide-solid';
import { useAdminAdvancedMetrics, useAdminCRMUsers } from '../../../lib/api-hooks';
import { CardSkeleton } from '../../ui/Skeleton';
import {
  type AnomalyAlert,
  type ChurnPrediction,
  type ExpansionPrediction,
  type HealthTrend,
  AnomalyAlertCard,
  ChurnPredictionCard,
  ExpansionOpportunityCard,
  HealthTrendCard,
} from './PredictiveInsightsCards';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type PredictionType = 'churn' | 'expansion' | 'anomaly' | 'health';

const TIER_MRR_USD = {
  enterprise: 199,
  team: 29,
  pro: 9,
} as const;

type TierMrrKey = keyof typeof TIER_MRR_USD;

/** List-price MRR per seat, defaulting unknown tiers to the pro price. */
function tierMrrUsd(tier: string | null | undefined): number {
  if (tier === 'enterprise') {
    return TIER_MRR_USD.enterprise;
  }
  if (tier === 'team') {
    return TIER_MRR_USD.team;
  }
  return TIER_MRR_USD.pro;
}

const STICKINESS_LOW_THRESHOLD = 10;
const ACTIVATION_LOW_THRESHOLD = 50;

const ANNUAL_MONTHS = 12;

/** Upgrade price signals derived from list-price MRR instead of scattered literals. */
function upgradeProbability(priority: string): number {
  if (priority === 'urgent') {
    return 0.85;
  }
  if (priority === 'high') {
    return 0.65;
  }
  return 0.4;
}

/** Next tier up the ladder; every non-pro tier upgrades to enterprise. */
function nextTier(tier: string): 'team' | 'enterprise' {
  return tier === 'pro' ? 'team' : 'enterprise';
}

/** Per-tier health-score deltas applied to project the predicted score. */
const HEALTH_TREND_DELTAS = { improving: 8, stable: 0, declining: -12 } as const;
type HealthTrendDirection = keyof typeof HEALTH_TREND_DELTAS;

function healthTrendDirection(score: number): HealthTrendDirection {
  if (score > 70) {
    return 'improving';
  }
  if (score > 40) {
    return 'stable';
  }
  return 'declining';
}

export const PredictiveInsights: Component = () => {
  const [activeTab, setActiveTab] = createSignal<PredictionType>('churn');

  const metricsQuery = useAdminAdvancedMetrics();
  const usersQuery = useAdminCRMUsers(1, 100, '');

  const churnPredictions = createMemo((): ChurnPrediction[] => {
    if (!metricsQuery.data?.churn_risk_segments) {
      return [];
    }

    return metricsQuery.data.churn_risk_segments
      .filter(s => s.risk_segment === 'high' || s.risk_segment === 'critical')
      .map((segment, i) => {
        // Segment rows are aggregates: they carry no customer identity, so a
        // synthetic label is used rather than pairing with unrelated
        // expansion-opportunity records by index.
        const probability = segment.risk_segment === 'critical' ? 0.8 : 0.55;
        const mrrPerUser = tierMrrUsd(segment.tier);

        return {
          customerId: `segment-${segment.risk_segment}-${i}`,
          email: `${segment.tier || 'pro'}-${segment.risk_segment}-segment`,
          company: null,
          tier: segment.tier || 'pro',
          probability,
          riskFactors: [
            `${Math.round(segment.avg_monthly_commands)} commands/month`,
            `${segment.user_count} similar users`,
            segment.risk_segment === 'critical' ? 'No activity 14+ days' : 'Declining usage',
          ],
          mrrAtRisk: mrrPerUser * segment.user_count,
          recommendedAction:
            segment.risk_segment === 'critical'
              ? 'Immediate outreach with personalized value demo'
              : 'Schedule success check-in within 48 hours',
        };
      })
      .slice(0, 6);
  });

  const expansionPredictions = createMemo((): ExpansionPrediction[] => {
    if (!metricsQuery.data?.expansion_opportunities) {
      return [];
    }

    return metricsQuery.data.expansion_opportunities.map(opp => {
      const probability = upgradeProbability(opp.priority);
      const potentialUpgrade = nextTier(opp.tier);
      const potentialArr = (TIER_MRR_USD[potentialUpgrade] ?? 0) * ANNUAL_MONTHS;

      return {
        customerId: opp.customer_id,
        email: opp.email,
        company: opp.company,
        tier: opp.tier,
        probability,
        signals: [
          `${opp.active_machines}/${opp.max_seats} seats used`,
          `${Math.round(opp.hours_saved_30d)}h saved/month`,
          opp.opportunity_type.replace('_', ' '),
        ],
        potentialUpgrade,
        potentialArr,
        recommendedAction:
          opp.priority === 'urgent'
            ? 'Present upgrade path with team-based pricing'
            : 'Share ROI report and schedule demo of premium features',
      };
    });
  });

  /**
   * Threshold breaches derived from live metrics only. Unlike fabricated alert
   * feeds, these carry no invented timestamps or affected-user counts — the
   * description states the measured fact.
   */
  const anomalyAlerts = createMemo((): AnomalyAlert[] => {
    const data = metricsQuery.data;
    if (!data?.engagement) {
      return [];
    }

    const alerts: AnomalyAlert[] = [];
    const dau = data.engagement.dau || 0;
    const mau = data.engagement.mau || 0;
    const stickiness = mau > 0 ? (dau / mau) * 100 : null;

    if (stickiness !== null && stickiness < STICKINESS_LOW_THRESHOLD) {
      alerts.push({
        id: 'stickiness-low',
        severity: 'high',
        description: `Daily-to-monthly active ratio is ${stickiness.toFixed(1)}%, below the ${STICKINESS_LOW_THRESHOLD}% threshold`,
      });
    }

    const activationPct = data.time_to_value?.pct_activated_week1;
    if (activationPct !== undefined && activationPct < ACTIVATION_LOW_THRESHOLD) {
      alerts.push({
        id: 'activation-low',
        severity: 'critical',
        description: `Week-one activation rate is ${Math.round(activationPct)}%, below the ${ACTIVATION_LOW_THRESHOLD}% threshold`,
      });
    }

    return alerts;
  });

  const healthTrends = createMemo((): HealthTrend[] => {
    if (!usersQuery.data?.users) {
      return [];
    }

    return usersQuery.data.users.slice(0, 8).map(user => {
      const score = user.engagement_score || 50;
      const trend = healthTrendDirection(score);
      const delta = HEALTH_TREND_DELTAS[trend];

      return {
        customerId: user.id,
        email: user.email,
        currentScore: score,
        predictedScore: Math.min(100, Math.max(0, score + delta)),
        trend,
        trendStrength: delta,
      };
    });
  });

  const tabs: { id: PredictionType; label: string; icon: typeof Brain; count: () => number }[] = [
    {
      id: 'churn',
      label: 'Churn Risk',
      icon: TriangleAlert,
      count: () => churnPredictions().length,
    },
    {
      id: 'expansion',
      label: 'Expansion',
      icon: TrendingUp,
      count: () => expansionPredictions().length,
    },
    { id: 'anomaly', label: 'Anomalies', icon: Bell, count: () => anomalyAlerts().length },
    { id: 'health', label: 'Health Trends', icon: Activity, count: () => healthTrends().length },
  ];

  return (
    <div class="space-y-8">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="flex items-center gap-3 text-2xl font-black tracking-tight text-white">
            <div class="bg-photon-500/10 rounded-xl p-2">
              <Brain size={24} class="text-photon-400" />
            </div>
            Predictive Insights
          </h2>
          <p class="text-nebula-500 mt-2 text-sm">
            AI-powered predictions and actionable recommendations
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              await Promise.all([metricsQuery.refetch(), usersQuery.refetch()]);
            }}
            disabled={metricsQuery.isRefetching || usersQuery.isRefetching}
            class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10"
          >
            <RefreshCw
              size={16}
              class={metricsQuery.isRefetching || usersQuery.isRefetching ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-1.5">
        <For each={tabs}>
          {tab => (
            <button
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab() === tab.id}
              class={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all',
                activeTab() === tab.id
                  ? 'bg-white text-black shadow-lg'
                  : 'text-nebula-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
              <Show when={tab.count() > 0}>
                <span
                  class={cn(
                    'text-2xs rounded-full px-2 py-0.5 font-black',
                    activeTab() === tab.id ? 'bg-black/10 text-black' : 'bg-white/10 text-white'
                  )}
                >
                  {tab.count()}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <Show when={metricsQuery.isLoading || usersQuery.isLoading}>
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </Show>

      <Show when={metricsQuery.isError || usersQuery.isError}>
        <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <p class="font-bold text-rose-400">Failed to load predictive insights</p>
          <p class="mt-2 text-sm text-slate-400">
            {metricsQuery.error?.message || usersQuery.error?.message}
          </p>
          <button
            type="button"
            onClick={() => void Promise.all([metricsQuery.refetch(), usersQuery.refetch()])}
            class="mt-4 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-600"
          >
            Try Again
          </button>
        </div>
      </Show>

      <Show when={metricsQuery.isSuccess && usersQuery.isSuccess}>
        <Show when={activeTab() === 'churn'}>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <p class="text-nebula-400 text-sm">
                <span class="text-flare-400 font-bold">{churnPredictions().length}</span> at-risk
                segments detected from current activity
              </p>
              <p class="text-flare-400 font-mono text-sm font-bold">
                $
                {churnPredictions()
                  .reduce((sum, p) => sum + p.mrrAtRisk, 0)
                  .toLocaleString()}{' '}
                MRR at risk
              </p>
            </div>

            <Show
              when={churnPredictions().length > 0}
              fallback={
                <div class="border-aurora-500/20 bg-aurora-500/5 rounded-2xl border p-8 text-center">
                  <Shield size={32} class="text-aurora-400 mx-auto mb-3" />
                  <p class="text-aurora-400 font-bold">No High-Risk Churn Detected</p>
                  <p class="text-nebula-500 mt-2 text-sm">
                    No high-risk segments were detected in the current metrics
                  </p>
                </div>
              }
            >
              <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <For each={churnPredictions()}>
                  {prediction => <ChurnPredictionCard prediction={prediction} />}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={activeTab() === 'expansion'}>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <p class="text-nebula-400 text-sm">
                <span class="text-aurora-400 font-bold">{expansionPredictions().length}</span>{' '}
                expansion opportunities identified
              </p>
              <p class="text-aurora-400 font-mono text-sm font-bold">
                +$
                {expansionPredictions()
                  .reduce((sum, p) => sum + p.potentialArr, 0)
                  .toLocaleString()}{' '}
                potential ARR
              </p>
            </div>

            <Show
              when={expansionPredictions().length > 0}
              fallback={
                <div class="border-nebula-500/20 bg-nebula-500/5 rounded-2xl border p-8 text-center">
                  <Target size={32} class="text-nebula-400 mx-auto mb-3" />
                  <p class="text-nebula-400 font-bold">No Expansion Opportunities</p>
                  <p class="text-nebula-500 mt-2 text-sm">
                    No customers are currently showing expansion signals
                  </p>
                </div>
              }
            >
              <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <For each={expansionPredictions()}>
                  {prediction => <ExpansionOpportunityCard prediction={prediction} />}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={activeTab() === 'anomaly'}>
          <div class="space-y-4">
            <Show
              when={anomalyAlerts().length > 0}
              fallback={
                <div class="border-aurora-500/20 bg-aurora-500/5 rounded-2xl border p-8 text-center">
                  <Shield size={32} class="text-aurora-400 mx-auto mb-3" />
                  <p class="text-aurora-400 font-bold">All Thresholds Normal</p>
                  <p class="text-nebula-500 mt-2 text-sm">
                    Engagement and activation metrics are within their normal ranges
                  </p>
                </div>
              }
            >
              <div class="space-y-3">
                <For each={anomalyAlerts()}>{alert => <AnomalyAlertCard alert={alert} />}</For>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={activeTab() === 'health'}>
          <div class="space-y-4">
            <p class="text-nebula-400 text-sm">
              Predicted health score changes based on current activity
            </p>

            <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <For each={healthTrends()}>{trend => <HealthTrendCard trend={trend} />}</For>
            </div>
          </div>
        </Show>
      </Show>

      <div class="from-photon-500/5 rounded-3xl border border-white/5 bg-gradient-to-br to-indigo-500/5 p-6">
        <h3 class="mb-4 flex items-center gap-2 text-lg font-black text-white">
          <Brain size={20} class="text-photon-400" />
          AI-Powered Summary
        </h3>
        <div class="grid gap-4 md:grid-cols-3">
          <div class="bg-void-850/50 rounded-xl border border-white/5 p-4">
            <p class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
              Revenue at Risk
            </p>
            <p class="font-display text-flare-400 mt-1 text-3xl font-black">
              $
              {churnPredictions()
                .reduce((sum, p) => sum + p.mrrAtRisk, 0)
                .toLocaleString()}
            </p>
            <p class="text-nebula-500 mt-1 text-xs">
              {churnPredictions().length} segments need attention
            </p>
          </div>
          <div class="bg-void-850/50 rounded-xl border border-white/5 p-4">
            <p class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
              Expansion Potential
            </p>
            <p class="font-display text-aurora-400 mt-1 text-3xl font-black">
              +$
              {expansionPredictions()
                .reduce((sum, p) => sum + p.potentialArr, 0)
                .toLocaleString()}
            </p>
            <p class="text-nebula-500 mt-1 text-xs">
              {expansionPredictions().length} upgrade opportunities
            </p>
          </div>
          <div class="bg-void-850/50 rounded-xl border border-white/5 p-4">
            <p class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
              Active Alerts
            </p>
            <p class="font-display text-solar-400 mt-1 text-3xl font-black">
              {anomalyAlerts().length}
            </p>
            <p class="text-nebula-500 mt-1 text-xs">
              {anomalyAlerts().filter(a => a.severity === 'critical').length} critical
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictiveInsights;
