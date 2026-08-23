import { type Component, createMemo, createUniqueId, Show, splitProps } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type RingSize = 'sm' | 'md' | 'lg';
type HealthGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

interface MetricRingProps {
  value: number;
  label?: string;
  size?: RingSize;
  showGrade?: boolean;
  color?: string;
  animated?: boolean;
  showValue?: boolean;
  trackColor?: string;
  class?: string;
}

type RingSizeConfig = {
  [K in RingSize]: {
    diameter: number;
    strokeWidth: number;
    fontSize: string;
    labelSize: string;
    gradeSize: string;
  };
};

const sizeConfig: RingSizeConfig = {
  sm: {
    diameter: 48,
    strokeWidth: 4,
    fontSize: 'text-sm',
    labelSize: 'text-2xs',
    gradeSize: 'text-xs',
  },
  md: {
    diameter: 80,
    strokeWidth: 6,
    fontSize: 'text-xl',
    labelSize: 'text-xs',
    gradeSize: 'text-sm',
  },
  lg: {
    diameter: 120,
    strokeWidth: 8,
    fontSize: 'text-3xl',
    labelSize: 'text-sm',
    gradeSize: 'text-base',
  },
};

const getGradeFromScore = (score: number): HealthGrade => {
  if (score >= 95) {
    return 'A+';
  }
  if (score >= 85) {
    return 'A';
  }
  if (score >= 70) {
    return 'B';
  }
  if (score >= 50) {
    return 'C';
  }
  if (score >= 30) {
    return 'D';
  }
  return 'F';
};

type GradeColors = {
  [K in HealthGrade]: {
    color: string;
    glow: string;
    textClass: string;
  };
};

const gradeColors: GradeColors = {
  'A+': {
    color: 'var(--grade-a-plus, #059669)',
    glow: 'var(--grade-a-plus-glow)',
    textClass: 'text-aurora-600',
  },
  A: {
    color: 'var(--grade-a, var(--color-aurora-500))',
    glow: 'var(--grade-a-glow)',
    textClass: 'text-aurora-400',
  },
  B: {
    color: 'var(--grade-b, var(--color-electric-500))',
    glow: 'var(--grade-b-glow)',
    textClass: 'text-electric-400',
  },
  C: {
    color: 'var(--grade-c, var(--color-solar-500))',
    glow: 'var(--grade-c-glow)',
    textClass: 'text-solar-400',
  },
  D: {
    color: 'var(--grade-d, #f97316)',
    glow: 'var(--grade-d-glow)',
    textClass: 'text-orange-400',
  },
  F: {
    color: 'var(--grade-f, var(--color-flare-500))',
    glow: 'var(--grade-f-glow)',
    textClass: 'text-flare-400',
  },
};

const getScoreColor = (score: number, customColor?: string): string => {
  if (customColor) {
    return customColor;
  }
  const grade = getGradeFromScore(score);
  return gradeColors[grade].color;
};

export const MetricRing: Component<MetricRingProps> = props => {
  const [local, others] = splitProps(props, [
    'value',
    'label',
    'size',
    'showGrade',
    'color',
    'animated',
    'showValue',
    'trackColor',
    'class',
  ]);

  const config = createMemo(() => sizeConfig[local.size || 'md']);
  const normalizedValue = createMemo(() => Math.max(0, Math.min(100, local.value)));
  const grade = createMemo(() => getGradeFromScore(normalizedValue()));
  const gradeConfig = createMemo(() => gradeColors[grade()]);
  const strokeColor = createMemo(() => getScoreColor(normalizedValue(), local.color));
  const showValue = () => local.showValue !== false;

  const radius = createMemo(() => (config().diameter - config().strokeWidth) / 2);
  const circumference = createMemo(() => 2 * Math.PI * radius());
  const offset = createMemo(() => circumference() - (normalizedValue() / 100) * circumference());

  const gradientId = `metric-ring-gradient-${createUniqueId()}`;

  return (
    <div
      class={cn('relative inline-flex flex-col items-center justify-center', local.class)}
      role="meter"
      aria-valuenow={normalizedValue()}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={local.label ? `${local.label}: ${normalizedValue()}%` : `${normalizedValue()}%`}
      {...others}
    >
      <svg
        width={config().diameter}
        height={config().diameter}
        class="rotate-[-90deg]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color={strokeColor()} stop-opacity="1" />
            <stop offset="100%" stop-color={strokeColor()} stop-opacity="0.7" />
          </linearGradient>
          <filter id={`ring-glow-${gradientId}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx={config().diameter / 2}
          cy={config().diameter / 2}
          r={radius()}
          fill="none"
          stroke={local.trackColor || 'var(--ring-track-color, var(--color-void-700))'}
          stroke-width={config().strokeWidth}
          class="opacity-100"
        />

        <circle
          cx={config().diameter / 2}
          cy={config().diameter / 2}
          r={radius()}
          fill="none"
          stroke={`url(#${gradientId})`}
          stroke-width={config().strokeWidth}
          stroke-linecap="round"
          stroke-dasharray={`${circumference()}`}
          stroke-dashoffset={local.animated ? circumference() : offset()}
          filter={`url(#ring-glow-${gradientId})`}
          class={cn(
            'ease-smooth transition-all duration-1000',
            local.animated && 'animate-gauge-fill'
          )}
          style={{
            '--gauge-circumference': `${circumference()}`,
            '--gauge-offset': `${offset()}`,
          }}
        />
      </svg>

      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <Show when={local.showGrade && !showValue()}>
          <span class={cn('font-display font-black', gradeConfig().textClass, config().gradeSize)}>
            {grade()}
          </span>
        </Show>

        <Show when={showValue() && !local.showGrade}>
          <span
            class={cn('font-display font-black tabular-nums', config().fontSize)}
            style={{ color: strokeColor() }}
          >
            {Math.round(normalizedValue())}
          </span>
        </Show>

        <Show when={showValue() && local.showGrade}>
          <span
            class={cn('font-display font-black tabular-nums', config().fontSize)}
            style={{ color: strokeColor() }}
          >
            {Math.round(normalizedValue())}
          </span>
          <span
            class={cn('text-nebula-500 font-bold tracking-wider uppercase', config().labelSize)}
          >
            {grade()}
          </span>
        </Show>

        <Show when={local.label && !local.showGrade}>
          <span
            class={cn(
              'text-nebula-500 mt-0.5 font-medium tracking-wider uppercase',
              config().labelSize
            )}
          >
            {local.label}
          </span>
        </Show>
      </div>
    </div>
  );
};

export default MetricRing;
