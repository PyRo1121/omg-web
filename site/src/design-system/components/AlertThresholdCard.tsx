import type { Component, JSX } from 'solid-js';
import { Show, For, createSignal, createMemo } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Bell,
  BellOff,
  AlertTriangle,
  AlertOctagon,
  Settings,
  Slack,
  Mail,
  Check,
  ChevronDown,
} from 'lucide-solid';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type NotificationChannel = 'slack' | 'email';

export interface AlertThreshold {
  min?: number;
  max?: number;
  warningMin?: number;
  warningMax?: number;
  criticalMin?: number;
  criticalMax?: number;
}

export interface AlertConfig {
  enabled: boolean;
  threshold: AlertThreshold;
  channels: NotificationChannel[];
  metricId: string;
}

export interface AlertThresholdCardProps {
  metricId: string;
  metricName: string;
  metricDescription?: string;
  currentValue?: number;
  unit?: string;
  minPossible?: number;
  maxPossible?: number;
  config: AlertConfig;
  onChange: (config: AlertConfig) => void;
  icon?: JSX.Element;
  class?: string;
}

const Toggle: Component<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label'?: string;
  disabled?: boolean;
}> = props => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props['aria-label']}
      disabled={props.disabled}
      class={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full',
        'transition-colors duration-300',
        props.checked ? 'bg-indigo-500' : 'bg-void-600',
        props.disabled && 'cursor-not-allowed opacity-50'
      )}
      onClick={() => !props.disabled && props.onChange(!props.checked)}
    >
      <span
        class={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-lg',
          'transform transition-transform duration-300',
          props.checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
};

const RangeSlider: Component<{
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  color?: string;
  disabled?: boolean;
}> = props => {
  const percentage = () => ((props.value - props.min) / (props.max - props.min)) * 100;

  return (
    <div class="space-y-2">
      <Show when={props.label}>
        <div class="flex items-center justify-between">
          <span class="text-2xs text-nebula-500 font-bold tracking-widest uppercase">
            {props.label}
          </span>
          <span class="font-mono text-sm font-bold tabular-nums" style={{ color: props.color }}>
            {props.value}
          </span>
        </div>
      </Show>
      <div class="relative h-2">
        <div class="bg-void-700 absolute inset-0 rounded-full" />
        <div
          class="absolute top-0 left-0 h-full rounded-full transition-all duration-150"
          style={{
            width: `${percentage()}%`,
            'background-color': props.color || 'var(--color-indigo-500)',
          }}
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          value={props.value}
          disabled={props.disabled}
          onInput={e => props.onChange(parseInt(e.currentTarget.value))}
          class={cn(
            'absolute inset-0 h-full w-full cursor-pointer opacity-0',
            props.disabled && 'cursor-not-allowed'
          )}
        />
        <div
          class={cn(
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full',
            'pointer-events-none border-2 bg-white shadow-lg',
            'transition-all duration-150'
          )}
          style={{
            left: `calc(${percentage()}% - 8px)`,
            'border-color': props.color || 'var(--color-indigo-500)',
          }}
        />
      </div>
    </div>
  );
};

const ChannelSelector: Component<{
  selected: NotificationChannel[];
  onChange: (channels: NotificationChannel[]) => void;
  disabled?: boolean;
}> = props => {
  const [isOpen, setIsOpen] = createSignal(false);

  const toggleChannel = (channel: NotificationChannel) => {
    if (props.selected.includes(channel)) {
      props.onChange(props.selected.filter(c => c !== channel));
    } else {
      props.onChange([...props.selected, channel]);
    }
  };

  const channels: { id: NotificationChannel; label: string; icon: typeof Slack }[] = [
    { id: 'slack', label: 'Slack', icon: Slack },
    { id: 'email', label: 'Email', icon: Mail },
  ];

  return (
    <div class="relative">
      <button
        type="button"
        class={cn(
          'flex w-full items-center gap-2 rounded-xl px-3 py-2',
          'bg-void-800 border border-white/10',
          'text-nebula-300 text-sm',
          'transition-all duration-300',
          'hover:border-white/20',
          props.disabled && 'cursor-not-allowed opacity-50'
        )}
        onClick={() => !props.disabled && setIsOpen(!isOpen())}
        disabled={props.disabled}
      >
        <Bell size={14} class="text-nebula-500" />
        <span class="flex-1 text-left">
          {props.selected.length === 0
            ? 'Select channels...'
            : `${props.selected.length} channel${props.selected.length > 1 ? 's' : ''}`}
        </span>
        <ChevronDown
          size={14}
          class={cn('text-nebula-500 transition-transform duration-300', isOpen() && 'rotate-180')}
        />
      </button>

      <Show when={isOpen()}>
        <div class="bg-void-850 absolute top-full right-0 left-0 z-50 mt-1 rounded-xl border border-white/10 p-2 shadow-xl">
          <For each={channels}>
            {channel => {
              const Icon = channel.icon;
              const isSelected = props.selected.includes(channel.id);
              return (
                <button
                  type="button"
                  class={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2',
                    'transition-all duration-300',
                    isSelected
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-nebula-400 hover:bg-white/5 hover:text-white'
                  )}
                  onClick={() => toggleChannel(channel.id)}
                >
                  <Icon size={16} />
                  <span class="flex-1 text-left">{channel.label}</span>
                  <Show when={isSelected}>
                    <Check size={14} />
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

const ThresholdVisualizer: Component<{
  currentValue?: number;
  threshold: AlertThreshold;
  min: number;
  max: number;
  unit?: string;
}> = props => {
  const getPosition = (value: number) => {
    return ((value - props.min) / (props.max - props.min)) * 100;
  };

  const getZoneClass = () => {
    const value = props.currentValue;
    if (value === undefined) {
      return 'normal';
    }

    const { criticalMin, criticalMax, warningMin, warningMax } = props.threshold;

    if (criticalMin !== undefined && value <= criticalMin) {
      return 'critical';
    }
    if (criticalMax !== undefined && value >= criticalMax) {
      return 'critical';
    }
    if (warningMin !== undefined && value <= warningMin) {
      return 'warning';
    }
    if (warningMax !== undefined && value >= warningMax) {
      return 'warning';
    }

    return 'normal';
  };

  const zone = createMemo(getZoneClass);

  return (
    <div class="space-y-3">
      <div class="bg-void-800 relative h-8 overflow-hidden rounded-xl">
        <Show
          when={
            props.threshold.criticalMin === undefined
              ? undefined
              : { value: props.threshold.criticalMin }
          }
        >
          {criticalMin => (
            <div
              class="bg-alert-threshold-critical-zone absolute top-0 bottom-0"
              style={{
                left: '0%',
                width: `${getPosition(criticalMin().value)}%`,
              }}
            />
          )}
        </Show>
        <Show
          when={
            props.threshold.warningMin === undefined
              ? undefined
              : { value: props.threshold.warningMin }
          }
        >
          {warningMin => (
            <div
              class="bg-alert-threshold-warning-zone absolute top-0 bottom-0"
              style={{
                left:
                  props.threshold.criticalMin !== undefined
                    ? `${getPosition(props.threshold.criticalMin)}%`
                    : '0%',
                width: `${getPosition(warningMin().value) - (props.threshold.criticalMin !== undefined ? getPosition(props.threshold.criticalMin) : 0)}%`,
              }}
            />
          )}
        </Show>
        <div
          class="bg-alert-threshold-normal-zone absolute top-0 bottom-0"
          style={{
            left: `${getPosition(props.threshold.warningMin ?? props.threshold.criticalMin ?? props.min)}%`,
            right: `${100 - getPosition(props.threshold.warningMax ?? props.threshold.criticalMax ?? props.max)}%`,
          }}
        />
        <Show
          when={
            props.threshold.warningMax === undefined
              ? undefined
              : { value: props.threshold.warningMax }
          }
        >
          {warningMax => (
            <div
              class="bg-alert-threshold-warning-zone absolute top-0 bottom-0"
              style={{
                left: `${getPosition(warningMax().value)}%`,
                width:
                  props.threshold.criticalMax !== undefined
                    ? `${getPosition(props.threshold.criticalMax) - getPosition(warningMax().value)}%`
                    : `${100 - getPosition(warningMax().value)}%`,
              }}
            />
          )}
        </Show>
        <Show
          when={
            props.threshold.criticalMax === undefined
              ? undefined
              : { value: props.threshold.criticalMax }
          }
        >
          {criticalMax => (
            <div
              class="bg-alert-threshold-critical-zone absolute top-0 bottom-0"
              style={{
                left: `${getPosition(criticalMax().value)}%`,
                right: '0%',
              }}
            />
          )}
        </Show>
        <Show when={props.currentValue === undefined ? undefined : { value: props.currentValue }}>
          {current => (
            <>
              <div
                class={cn(
                  'absolute top-0 bottom-0 w-0.5 transition-all duration-500',
                  zone() === 'critical' && 'bg-flare-500 shadow-[0_0_10px_var(--color-flare-500)]',
                  zone() === 'warning' && 'bg-solar-500 shadow-[0_0_10px_var(--color-solar-500)]',
                  zone() === 'normal' && 'bg-aurora-500 shadow-[0_0_10px_var(--color-aurora-500)]'
                )}
                style={{ left: `${getPosition(current().value)}%` }}
              />
              <div
                class={cn(
                  'absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 transition-all duration-500',
                  zone() === 'critical' && 'bg-flare-500 border-flare-400',
                  zone() === 'warning' && 'bg-solar-500 border-solar-400',
                  zone() === 'normal' && 'bg-aurora-500 border-aurora-400'
                )}
                style={{ left: `calc(${getPosition(current().value)}% - 6px)` }}
              />
            </>
          )}
        </Show>
      </div>
      <div class="text-2xs text-nebula-600 flex items-center justify-between font-mono">
        <span>
          {props.min}
          {props.unit}
        </span>
        <span>
          {props.max}
          {props.unit}
        </span>
      </div>
    </div>
  );
};

export const AlertThresholdCard: Component<AlertThresholdCardProps> = props => {
  const [isExpanded, setIsExpanded] = createSignal(false);

  const min = () => props.minPossible ?? 0;
  const max = () => props.maxPossible ?? 100;

  const updateThreshold = (updates: Partial<AlertThreshold>) => {
    props.onChange({
      ...props.config,
      threshold: { ...props.config.threshold, ...updates },
    });
  };

  const getZoneClass = () => {
    const value = props.currentValue;
    if (value === undefined || !props.config.enabled) {
      return 'normal';
    }

    const { criticalMin, criticalMax, warningMin, warningMax } = props.config.threshold;

    if (criticalMin !== undefined && value <= criticalMin) {
      return 'critical';
    }
    if (criticalMax !== undefined && value >= criticalMax) {
      return 'critical';
    }
    if (warningMin !== undefined && value <= warningMin) {
      return 'warning';
    }
    if (warningMax !== undefined && value >= warningMax) {
      return 'warning';
    }

    return 'normal';
  };

  const zone = createMemo(getZoneClass);

  return (
    <div
      class={cn(
        'rounded-3xl border transition-all duration-300',
        'bg-void-850',
        zone() === 'critical' &&
          props.config.enabled &&
          'border-flare-500/30 shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]',
        zone() === 'warning' &&
          props.config.enabled &&
          'border-solar-500/30 shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]',
        zone() === 'normal' && 'border-white/5 hover:border-white/10',
        props.class
      )}
    >
      <div class="p-6">
        <div class="flex items-start justify-between">
          <div class="flex items-start gap-3">
            <Show when={props.icon}>
              <div
                class={cn(
                  'rounded-xl p-2.5 transition-colors duration-300',
                  zone() === 'critical' && props.config.enabled && 'bg-flare-500/10',
                  zone() === 'warning' && props.config.enabled && 'bg-solar-500/10',
                  (zone() === 'normal' || !props.config.enabled) && 'bg-indigo-500/10'
                )}
              >
                {props.icon}
              </div>
            </Show>
            <div>
              <h3 class="font-display flex items-center gap-2 font-bold text-white">
                {props.metricName}
                <Show when={zone() === 'critical' && props.config.enabled}>
                  <AlertOctagon size={16} class="text-flare-500" />
                </Show>
                <Show when={zone() === 'warning' && props.config.enabled}>
                  <AlertTriangle size={16} class="text-solar-500" />
                </Show>
              </h3>
              <Show when={props.metricDescription}>
                <p class="text-nebula-500 mt-1 text-sm">{props.metricDescription}</p>
              </Show>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <Show when={props.currentValue !== undefined}>
              <div class="text-right">
                <span
                  class={cn(
                    'font-mono text-2xl font-black tabular-nums transition-colors duration-300',
                    zone() === 'critical' && props.config.enabled && 'text-flare-400',
                    zone() === 'warning' && props.config.enabled && 'text-solar-400',
                    (zone() === 'normal' || !props.config.enabled) && 'text-white'
                  )}
                >
                  {props.currentValue}
                </span>
                <Show when={props.unit}>
                  <span class="text-nebula-500 ml-1 text-sm">{props.unit}</span>
                </Show>
              </div>
            </Show>
            <Toggle
              checked={props.config.enabled}
              onChange={enabled => props.onChange({ ...props.config, enabled })}
              aria-label={`${props.config.enabled ? 'Disable' : 'Enable'} alerts for ${props.metricName}`}
            />
          </div>
        </div>

        <Show when={props.config.enabled}>
          <div class="mt-6">
            <ThresholdVisualizer
              currentValue={props.currentValue}
              threshold={props.config.threshold}
              min={min()}
              max={max()}
              unit={props.unit}
            />
          </div>
        </Show>
      </div>

      <Show when={props.config.enabled}>
        <button
          type="button"
          class={cn(
            'flex w-full items-center justify-between px-6 py-3',
            'border-t border-white/5',
            'text-nebula-400 text-sm',
            'transition-all duration-300',
            'hover:text-nebula-300 hover:bg-white/[0.02]'
          )}
          onClick={() => setIsExpanded(!isExpanded())}
        >
          <span class="flex items-center gap-2">
            <Settings size={14} />
            <span>Configure thresholds</span>
          </span>
          <ChevronDown
            size={14}
            class={cn('transition-transform duration-300', isExpanded() && 'rotate-180')}
          />
        </button>

        <Show when={isExpanded()}>
          <div class="space-y-6 border-t border-white/5 px-6 pt-6 pb-6">
            <div class="grid grid-cols-2 gap-6">
              <RangeSlider
                value={props.config.threshold.warningMin ?? min()}
                min={min()}
                max={max()}
                onChange={value => updateThreshold({ warningMin: value })}
                label="Warning (Low)"
                color="var(--color-solar-500)"
              />
              <RangeSlider
                value={props.config.threshold.warningMax ?? max()}
                min={min()}
                max={max()}
                onChange={value => updateThreshold({ warningMax: value })}
                label="Warning (High)"
                color="var(--color-solar-500)"
              />
            </div>

            <div class="grid grid-cols-2 gap-6">
              <RangeSlider
                value={props.config.threshold.criticalMin ?? min()}
                min={min()}
                max={max()}
                onChange={value => updateThreshold({ criticalMin: value })}
                label="Critical (Low)"
                color="var(--color-flare-500)"
              />
              <RangeSlider
                value={props.config.threshold.criticalMax ?? max()}
                min={min()}
                max={max()}
                onChange={value => updateThreshold({ criticalMax: value })}
                label="Critical (High)"
                color="var(--color-flare-500)"
              />
            </div>

            <div>
              <label class="text-2xs text-nebula-500 mb-2 block font-bold tracking-widest uppercase">
                Notification Channels
              </label>
              <ChannelSelector
                selected={props.config.channels}
                onChange={channels => props.onChange({ ...props.config, channels })}
              />
            </div>
          </div>
        </Show>
      </Show>

      <Show when={!props.config.enabled}>
        <div class="px-6 pt-2 pb-6">
          <div class="text-nebula-600 flex items-center gap-2 text-sm">
            <BellOff size={14} />
            <span>Alerts disabled for this metric</span>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default AlertThresholdCard;
