import { type Component, For, Show, createMemo, splitProps } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  TrendingUp,
  Package,
  Users,
  RefreshCw,
  Zap,
  Target,
  ArrowRight,
  Clock,
  Building,
  Star,
} from 'lucide-solid';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type OpportunityType = 'upsell' | 'cross-sell' | 'expansion' | 'renewal';
type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very-high';
type RevenueImpact = 'low' | 'medium' | 'high' | 'critical';
type OpportunitySize = 'sm' | 'md' | 'lg';

interface OpportunityData {
  id: string;
  type: OpportunityType;
  confidence: ConfidenceLevel;
  revenueImpact: RevenueImpact;
  estimatedValue: number;
  customer: {
    name: string;
    currentTier?: string;
    currentMrr?: number;
  };
  title: string;
  description?: string;
  signals?: string[];
  daysToClose?: number;
  probability?: number;
}

interface OpportunityCardProps {
  opportunity: OpportunityData;
  size?: OpportunitySize;
  showSignals?: boolean;
  showActions?: boolean;
  compact?: boolean;
  animated?: boolean;
  onClick?: (opportunity: OpportunityData) => void;
  onAction?: (opportunity: OpportunityData, action: 'view' | 'dismiss' | 'snooze') => void;
  class?: string;
}

const typeConfig = {
  upsell: {
    icon: TrendingUp,
    label: 'Upsell',
    color: 'var(--opportunity-upsell, #34d399)',
    bgClass: 'bg-aurora-500/10',
    borderClass: 'border-aurora-500/30',
  },
  'cross-sell': {
    icon: Package,
    label: 'Cross-sell',
    color: 'var(--opportunity-cross-sell, #2ee8e8)',
    bgClass: 'bg-electric-500/10',
    borderClass: 'border-electric-500/30',
  },
  expansion: {
    icon: Users,
    label: 'Expansion',
    color: 'var(--opportunity-expansion, #b06de8)',
    bgClass: 'bg-photon-500/10',
    borderClass: 'border-photon-500/30',
  },
  renewal: {
    icon: RefreshCw,
    label: 'Renewal',
    color: 'var(--opportunity-renewal, #5a9ae8)',
    bgClass: 'bg-plasma-500/10',
    borderClass: 'border-plasma-500/30',
  },
};

const confidenceConfig = {
  low: {
    label: 'Low',
    color: 'var(--opportunity-low, #71717a)',
    bgClass: 'bg-nebula-500/10',
    borderClass: 'border-nebula-500/20',
    glowClass: '',
  },
  medium: {
    label: 'Medium',
    color: 'var(--opportunity-medium, #3b7dd1)',
    bgClass: 'bg-plasma-500/10',
    borderClass: 'border-plasma-500/25',
    glowClass: 'shadow-[0_0_15px_rgba(59,125,209,0.2)]',
  },
  high: {
    label: 'High',
    color: 'var(--opportunity-high, #22d3d3)',
    bgClass: 'bg-electric-500/10',
    borderClass: 'border-electric-500/30',
    glowClass: 'shadow-[0_0_20px_rgba(34,211,211,0.25)]',
  },
  'very-high': {
    label: 'Very High',
    color: 'var(--opportunity-very-high, #10b981)',
    bgClass: 'bg-aurora-500/15',
    borderClass: 'border-aurora-500/35',
    glowClass: 'shadow-[0_0_25px_rgba(16,185,129,0.3)]',
  },
} satisfies Record<
  ConfidenceLevel,
  {
    label: string;
    color: string;
    bgClass: string;
    borderClass: string;
    glowClass: string;
  }
>;

const revenueConfig = {
  low: { label: 'Low', color: 'var(--opportunity-revenue-low, #a1a1aa)' },
  medium: { label: 'Medium', color: 'var(--opportunity-revenue-medium, #2ee8e8)' },
  high: { label: 'High', color: 'var(--opportunity-revenue-high, #34d399)' },
  critical: { label: 'Critical', color: 'var(--opportunity-revenue-critical, #fbbf24)' },
} satisfies Record<RevenueImpact, { label: string; color: string }>;

const sizeConfig = {
  sm: {
    padding: 'p-4',
    titleSize: 'text-sm',
    valueSize: 'text-xl',
    iconSize: 16,
    iconPadding: 'p-2',
  },
  md: {
    padding: 'p-5',
    titleSize: 'text-base',
    valueSize: 'text-2xl',
    iconSize: 20,
    iconPadding: 'p-2.5',
  },
  lg: {
    padding: 'p-6',
    titleSize: 'text-lg',
    valueSize: 'text-3xl',
    iconSize: 24,
    iconPadding: 'p-3',
  },
} satisfies Record<
  OpportunitySize,
  {
    padding: string;
    titleSize: string;
    valueSize: string;
    iconSize: number;
    iconPadding: string;
  }
>;

const formatCurrency = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toLocaleString()}`;
};

export const OpportunityCard: Component<OpportunityCardProps> = props => {
  const [local, others] = splitProps(props, [
    'opportunity',
    'size',
    'showSignals',
    'showActions',
    'compact',
    'animated',
    'onClick',
    'onAction',
    'class',
  ]);

  const opp = () => local.opportunity;
  const type = createMemo(() => typeConfig[opp().type]);
  const confidence = createMemo(() => confidenceConfig[opp().confidence]);
  const revenue = createMemo(() => revenueConfig[opp().revenueImpact]);
  const size = () => sizeConfig[local.size || 'md'];

  const TypeIcon = type().icon;

  return (
    <div
      class={cn(
        'group relative overflow-hidden rounded-2xl border transition-all duration-300',
        'bg-void-850 hover:bg-void-800',
        'border-white/5 hover:border-white/10',
        'hover:translate-y-[-2px]',
        confidence().glowClass && `hover:${confidence().glowClass}`,
        size().padding,
        local.onClick && 'cursor-pointer',
        local.animated && 'animate-fade-up',
        local.class
      )}
      onClick={() => local.onClick?.(opp())}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') local.onClick?.(opp());
      }}
      tabIndex={local.onClick ? 0 : undefined}
      role={local.onClick ? 'button' : undefined}
      {...others}
    >
      <div
        class="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-0 blur-[40px] transition-opacity duration-500 group-hover:opacity-100"
        style={{ 'background-color': type().color }}
      />

      <div class="relative flex items-start justify-between">
        <div class="flex items-start gap-3">
          <div
            class={cn(
              type().bgClass,
              size().iconPadding,
              'rounded-xl transition-transform duration-500 group-hover:scale-110'
            )}
          >
            <TypeIcon size={size().iconSize} style={{ color: type().color }} />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class={cn('text-2xs rounded-full px-2 py-0.5 font-bold tracking-wider uppercase')}
                style={{ color: type().color, 'background-color': `${type().color}20` }}
              >
                {type().label}
              </span>
              <span
                class={cn('text-2xs rounded-full px-2 py-0.5 font-bold tracking-wider uppercase')}
                style={{ color: confidence().color, 'background-color': `${confidence().color}20` }}
              >
                {confidence().label} Confidence
              </span>
            </div>

            <h4 class={cn('mt-2 font-bold text-white', size().titleSize)}>{opp().title}</h4>

            <Show when={!local.compact && opp().description}>
              <p class="text-nebula-400 mt-1 line-clamp-2 text-sm">{opp().description}</p>
            </Show>

            <div class="mt-3 flex items-center gap-4 text-sm">
              <div class="flex items-center gap-1.5">
                <Building size={14} class="text-nebula-500" />
                <span class="text-nebula-300 font-medium">{opp().customer.name}</span>
                <Show when={opp().customer.currentTier}>
                  <span class="bg-void-700 text-2xs text-nebula-500 rounded px-1.5 py-0.5 font-bold uppercase">
                    {opp().customer.currentTier}
                  </span>
                </Show>
              </div>
              <Show when={opp().daysToClose}>
                <div class="text-nebula-500 flex items-center gap-1">
                  <Clock size={14} />
                  <span class="font-medium">{opp().daysToClose}d</span>
                </div>
              </Show>
            </div>
          </div>
        </div>

        <div class="flex flex-col items-end gap-2">
          <div class="text-right">
            <div class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
              Est. Value
            </div>
            <div
              class={cn('font-display font-black tabular-nums', size().valueSize)}
              style={{ color: revenue().color }}
            >
              {formatCurrency(opp().estimatedValue)}
            </div>
          </div>
          <Show when={opp().probability !== undefined}>
            <div class="bg-void-700 flex items-center gap-1.5 rounded-full px-2 py-1">
              <Target size={12} class="text-nebula-500" />
              <span class="text-nebula-300 text-xs font-bold tabular-nums">
                {opp().probability}%
              </span>
            </div>
          </Show>
        </div>
      </div>

      <Show when={local.showSignals && opp().signals && (opp().signals?.length ?? 0) > 0}>
        <div class="mt-4 border-t border-white/5 pt-4">
          <div class="text-2xs text-nebula-500 mb-2 font-bold tracking-widest uppercase">
            Signals
          </div>
          <div class="flex flex-wrap gap-2">
            <For each={opp().signals}>
              {signal => (
                <div class="bg-void-700 text-nebula-300 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs">
                  <Zap size={12} class="text-solar-400" />
                  {signal}
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={local.showActions}>
        <div class="mt-4 flex items-center justify-end gap-2 border-t border-white/5 pt-4">
          <button
            class="text-nebula-400 hover:text-nebula-300 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/5"
            onClick={e => {
              e.stopPropagation();
              local.onAction?.(opp(), 'snooze');
            }}
          >
            Snooze
          </button>
          <button
            class="text-nebula-400 hover:text-nebula-300 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/5"
            onClick={e => {
              e.stopPropagation();
              local.onAction?.(opp(), 'dismiss');
            }}
          >
            Dismiss
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-400 transition-colors hover:bg-indigo-500/20"
            onClick={e => {
              e.stopPropagation();
              local.onAction?.(opp(), 'view');
            }}
          >
            View Details
            <ArrowRight size={12} />
          </button>
        </div>
      </Show>
    </div>
  );
};

export interface OpportunityListProps {
  opportunities: OpportunityData[];
  sortBy?: 'value' | 'confidence' | 'daysToClose';
  filterType?: OpportunityType;
  showSignals?: boolean;
  showActions?: boolean;
  emptyMessage?: string;
  onItemClick?: (opportunity: OpportunityData) => void;
  onAction?: (opportunity: OpportunityData, action: 'view' | 'dismiss' | 'snooze') => void;
  class?: string;
}

export const OpportunityList: Component<OpportunityListProps> = props => {
  const sortedOpportunities = createMemo(() => {
    let items = [...props.opportunities];

    if (props.filterType) {
      items = items.filter(o => o.type === props.filterType);
    }

    const sortBy = props.sortBy ?? 'value';
    items.sort((a, b) => {
      if (sortBy === 'value') return b.estimatedValue - a.estimatedValue;
      if (sortBy === 'confidence') {
        const order = {
          'very-high': 4,
          high: 3,
          medium: 2,
          low: 1,
        } satisfies Record<ConfidenceLevel, number>;
        return order[b.confidence] - order[a.confidence];
      }
      if (sortBy === 'daysToClose') {
        return (a.daysToClose ?? 999) - (b.daysToClose ?? 999);
      }
      return 0;
    });

    return items;
  });

  return (
    <div class={cn('space-y-4', props.class)}>
      <Show when={sortedOpportunities().length === 0}>
        <div class="bg-void-850 flex flex-col items-center justify-center rounded-2xl border border-white/5 py-12">
          <Star size={32} class="text-nebula-600 mb-3" />
          <p class="text-nebula-500 font-medium">
            {props.emptyMessage || 'No opportunities found'}
          </p>
        </div>
      </Show>
      <For each={sortedOpportunities()}>
        {opportunity => (
          <OpportunityCard
            opportunity={opportunity}
            showSignals={props.showSignals}
            showActions={props.showActions}
            onClick={props.onItemClick}
            onAction={props.onAction}
            animated
          />
        )}
      </For>
    </div>
  );
};

export interface OpportunitySummaryProps {
  opportunities: OpportunityData[];
  class?: string;
}

export const OpportunitySummary: Component<OpportunitySummaryProps> = props => {
  const stats = createMemo(() => {
    const total = props.opportunities.length;
    const totalValue = props.opportunities.reduce((sum, o) => sum + o.estimatedValue, 0);
    const highConfidence = props.opportunities.filter(
      o => o.confidence === 'high' || o.confidence === 'very-high'
    ).length;
    const avgProbability =
      props.opportunities.reduce((sum, o) => sum + (o.probability ?? 0), 0) / (total || 1);

    const byType = props.opportunities.reduce(
      (acc, o) => {
        acc[o.type] = (acc[o.type] || 0) + 1;
        return acc;
      },
      {
        upsell: 0,
        'cross-sell': 0,
        expansion: 0,
        renewal: 0,
      } satisfies Record<OpportunityType, number>
    );

    return { total, totalValue, highConfidence, avgProbability, byType };
  });

  return (
    <div class={cn('grid grid-cols-4 gap-4', props.class)}>
      <div class="bg-void-850 rounded-xl border border-white/5 p-4">
        <div class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
          Total Pipeline
        </div>
        <div class="font-display text-aurora-400 mt-2 text-2xl font-black tabular-nums">
          {formatCurrency(stats().totalValue)}
        </div>
        <div class="text-nebula-500 mt-1 text-xs">{stats().total} opportunities</div>
      </div>
      <div class="bg-void-850 rounded-xl border border-white/5 p-4">
        <div class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
          High Confidence
        </div>
        <div class="font-display text-electric-400 mt-2 text-2xl font-black tabular-nums">
          {stats().highConfidence}
        </div>
        <div class="text-nebula-500 mt-1 text-xs">
          {stats().total > 0 ? ((stats().highConfidence / stats().total) * 100).toFixed(0) : 0}% of
          total
        </div>
      </div>
      <div class="bg-void-850 rounded-xl border border-white/5 p-4">
        <div class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
          Avg Probability
        </div>
        <div class="font-display text-plasma-400 mt-2 text-2xl font-black tabular-nums">
          {stats().avgProbability.toFixed(0)}%
        </div>
        <div class="text-nebula-500 mt-1 text-xs">Weighted close rate</div>
      </div>
      <div class="bg-void-850 rounded-xl border border-white/5 p-4">
        <div class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">By Type</div>
        <div class="mt-2 flex gap-2">
          <For each={Object.entries(stats().byType)}>
            {([type, count]) => {
              const config =
                Object.entries(typeConfig).find(([key]) => key === type)?.[1] ?? typeConfig.upsell;
              return (
                <div
                  class="rounded-lg px-2 py-1 text-xs font-bold tabular-nums"
                  style={{
                    color: config.color,
                    'background-color': `${config.color}20`,
                  }}
                >
                  {count}
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
};

export default OpportunityCard;
