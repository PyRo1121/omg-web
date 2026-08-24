import { type Component, For, createMemo } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  TriangleAlert,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  Bell,
  ChevronRight,
  Activity,
} from 'lucide-solid';
import { ProgressRing } from '../../../design-system/components/Charts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Progress-ring stroke colors, resolved once instead of scattered hex literals.
 * Values mirror the design tokens: flare-500 / aurora-500 / indigo-500.
 */
export const RING_COLORS = {
  danger: '#ef4444',
  success: '#10b981',
  neutral: '#6366f1',
} as const;

export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export function priorityFromProbability(probability: number): Priority {
  if (probability >= 0.7) {
    return 'urgent';
  }
  if (probability >= 0.5) {
    return 'high';
  }
  if (probability >= 0.3) {
    return 'medium';
  }
  return 'low';
}

export interface ChurnPrediction {
  customerId: string;
  email: string;
  company: string | null;
  tier: string;
  probability: number;
  riskFactors: string[];
  mrrAtRisk: number;
  recommendedAction: string;
}

export interface ExpansionPrediction {
  customerId: string;
  email: string;
  company: string | null;
  tier: string;
  probability: number;
  signals: string[];
  potentialUpgrade: string;
  potentialArr: number;
  recommendedAction: string;
}

/** A threshold breach derived from real metrics — no invented timestamps or counts. */
export interface AnomalyAlert {
  id: string;
  severity: 'critical' | 'high';
  description: string;
}

export interface HealthTrend {
  customerId: string;
  email: string;
  currentScore: number;
  predictedScore: number;
  trend: 'improving' | 'stable' | 'declining';
  trendStrength: number;
}

type PriorityConfig = { [K in Priority]: { color: string; bg: string; label: string } };

const PRIORITY_CONFIG: PriorityConfig = {
  urgent: { color: 'text-flare-400', bg: 'bg-flare-500/10', label: 'Urgent' },
  high: { color: 'text-solar-400', bg: 'bg-solar-500/10', label: 'High' },
  medium: { color: 'text-indigo-400', bg: 'bg-indigo-500/10', label: 'Medium' },
  low: { color: 'text-nebula-400', bg: 'bg-nebula-500/10', label: 'Low' },
};

const PriorityBadge: Component<{ priority: Priority }> = props => {
  const config = () => PRIORITY_CONFIG[props.priority];
  return (
    <span
      class={cn(
        'text-2xs rounded-full px-2 py-0.5 font-black tracking-widest uppercase',
        config().bg,
        config().color
      )}
    >
      {config().label}
    </span>
  );
};

export const ChurnPredictionCard: Component<{
  prediction: ChurnPrediction;
}> = props => {
  const riskLevel = createMemo(() => priorityFromProbability(props.prediction.probability));

  return (
    <div class="group bg-void-850 hover:border-flare-500/30 relative overflow-hidden rounded-2xl border border-white/5 p-5 transition-all duration-300">
      <div class="bg-flare-500/10 pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-0 blur-[40px] transition-opacity duration-500 group-hover:opacity-100" />

      <div class="relative">
        <div class="mb-4 flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="bg-flare-500/10 flex h-10 w-10 items-center justify-center rounded-xl">
              <TriangleAlert size={18} class="text-flare-400" />
            </div>
            <div>
              <h4 class="font-bold text-white">{props.prediction.email}</h4>
              <p class="text-2xs text-nebula-500">
                {props.prediction.company || props.prediction.tier}
              </p>
            </div>
          </div>
          <PriorityBadge priority={riskLevel()} />
        </div>

        <div class="mb-4 flex items-center gap-4">
          <ProgressRing
            value={props.prediction.probability * 100}
            size={60}
            strokeWidth={5}
            color={RING_COLORS.danger}
            showValue
            label="Churn Risk"
          />
          <div class="flex-1">
            <p class="text-nebula-400 text-xs font-bold">MRR at Risk</p>
            <p class="font-display text-flare-400 text-xl font-black">
              ${props.prediction.mrrAtRisk.toLocaleString()}
            </p>
          </div>
        </div>

        <div class="mb-4 space-y-2">
          <p class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">Risk Factors</p>
          <div class="flex flex-wrap gap-1.5">
            <For each={props.prediction.riskFactors.slice(0, 3)}>
              {factor => (
                <span class="bg-flare-500/10 text-2xs text-flare-400 rounded-full px-2 py-0.5">
                  {factor}
                </span>
              )}
            </For>
          </div>
        </div>

        <div class="border-aurora-500/20 bg-aurora-500/5 rounded-xl border p-3">
          <div class="flex items-start gap-2">
            <Zap size={14} class="text-aurora-400 mt-0.5 shrink-0" />
            <div class="flex-1">
              <p class="text-2xs text-aurora-400 font-bold tracking-widest uppercase">
                Recommended Action
              </p>
              <p class="text-aurora-300 mt-1 text-xs">{props.prediction.recommendedAction}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ExpansionOpportunityCard: Component<{
  prediction: ExpansionPrediction;
}> = props => {
  const opportunityLevel = createMemo(() => priorityFromProbability(props.prediction.probability));

  return (
    <div class="group bg-void-850 hover:border-aurora-500/30 relative overflow-hidden rounded-2xl border border-white/5 p-5 transition-all duration-300">
      <div class="bg-aurora-500/10 pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-0 blur-[40px] transition-opacity duration-500 group-hover:opacity-100" />

      <div class="relative">
        <div class="mb-4 flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="bg-aurora-500/10 flex h-10 w-10 items-center justify-center rounded-xl">
              <TrendingUp size={18} class="text-aurora-400" />
            </div>
            <div>
              <h4 class="font-bold text-white">{props.prediction.email}</h4>
              <p class="text-2xs text-nebula-500">
                {props.prediction.company ||
                  `${props.prediction.tier} → ${props.prediction.potentialUpgrade}`}
              </p>
            </div>
          </div>
          <PriorityBadge priority={opportunityLevel()} />
        </div>

        <div class="mb-4 flex items-center gap-4">
          <ProgressRing
            value={props.prediction.probability * 100}
            size={60}
            strokeWidth={5}
            color={RING_COLORS.success}
            showValue
            label="Upgrade Likely"
          />
          <div class="flex-1">
            <p class="text-nebula-400 text-xs font-bold">Potential ARR</p>
            <p class="font-display text-aurora-400 text-xl font-black">
              +${props.prediction.potentialArr.toLocaleString()}
            </p>
          </div>
        </div>

        <div class="mb-4 space-y-2">
          <p class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
            Expansion Signals
          </p>
          <div class="flex flex-wrap gap-1.5">
            <For each={props.prediction.signals.slice(0, 3)}>
              {signal => (
                <span class="bg-aurora-500/10 text-2xs text-aurora-400 rounded-full px-2 py-0.5">
                  {signal}
                </span>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <div class="flex items-start gap-2">
            <Target size={14} class="mt-0.5 shrink-0 text-indigo-400" />
            <div class="flex-1">
              <p class="text-2xs font-bold tracking-widest text-indigo-400 uppercase">
                Recommended Action
              </p>
              <p class="mt-1 text-xs text-indigo-300">{props.prediction.recommendedAction}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ANOMALY_SEVERITY_CONFIG = {
  critical: { color: 'text-flare-400', bg: 'bg-flare-500/10', icon: TriangleAlert },
  high: { color: 'text-solar-400', bg: 'bg-solar-500/10', icon: Bell },
} as const;

export const AnomalyAlertCard: Component<{
  alert: AnomalyAlert;
}> = props => {
  const config = () => ANOMALY_SEVERITY_CONFIG[props.alert.severity];
  const IconComponent = config().icon;

  return (
    <div
      class={cn(
        'relative overflow-hidden rounded-xl border p-4 transition-all duration-300',
        props.alert.severity === 'critical'
          ? 'border-flare-500/30 bg-flare-500/5'
          : 'bg-void-850 border-white/5'
      )}
    >
      <div class="flex items-start gap-3">
        <div
          class={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config().bg)}
        >
          <IconComponent size={16} class={config().color} />
        </div>

        <div class="min-w-0 flex-1">
          <span
            class={cn(
              'text-2xs rounded-full px-2 py-0.5 font-black tracking-widest uppercase',
              config().bg,
              config().color
            )}
          >
            {props.alert.severity}
          </span>
          <p class="mt-1 text-sm font-bold text-white">{props.alert.description}</p>
        </div>
      </div>
    </div>
  );
};

const TREND_CONFIG = {
  improving: { color: 'text-aurora-400', bg: 'bg-aurora-500/10', icon: TrendingUp },
  stable: { color: 'text-indigo-400', bg: 'bg-indigo-500/10', icon: Activity },
  declining: { color: 'text-flare-400', bg: 'bg-flare-500/10', icon: TrendingDown },
};

export const HealthTrendCard: Component<{ trend: HealthTrend }> = props => {
  const config = () => TREND_CONFIG[props.trend.trend];
  const IconComponent = config().icon;

  const ringColor = () =>
    props.trend.trend === 'declining'
      ? RING_COLORS.danger
      : props.trend.trend === 'improving'
        ? RING_COLORS.success
        : RING_COLORS.neutral;

  return (
    <div class="group bg-void-850 relative overflow-hidden rounded-xl border border-white/5 p-4 transition-all duration-300 hover:border-white/10">
      <div class="flex items-center gap-4">
        <ProgressRing
          value={props.trend.currentScore}
          size={48}
          strokeWidth={4}
          color={ringColor()}
          showValue
        />

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold text-white">{props.trend.email}</p>
          <div class="mt-1 flex items-center gap-2">
            <div class={cn('flex items-center gap-1 rounded-full px-2 py-0.5', config().bg)}>
              <IconComponent size={10} class={config().color} />
              <span class={cn('text-2xs font-bold', config().color)}>
                {props.trend.trendStrength > 0 ? '+' : ''}
                {props.trend.trendStrength}%
              </span>
            </div>
            <span class="text-2xs text-nebula-500">→ {props.trend.predictedScore}</span>
          </div>
        </div>

        <ChevronRight size={16} class="text-nebula-600 transition-colors group-hover:text-white" />
      </div>
    </div>
  );
};
