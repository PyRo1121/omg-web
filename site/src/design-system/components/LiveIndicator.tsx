import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import { cn } from '~/lib/prelude';

interface LiveIndicatorProps {
  label?: string;
  variant?: 'pulse' | 'ring' | 'dot' | 'bar';
  color?: 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  count?: number;
  class?: string;
}

const colorConfig = {
  success: {
    dot: 'bg-aurora-500',
    ring: 'border-aurora-500',
    glow: 'shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    text: 'text-aurora-400',
    bg: 'bg-aurora-500/10',
  },
  warning: {
    dot: 'bg-solar-500',
    ring: 'border-solar-500',
    glow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    text: 'text-solar-400',
    bg: 'bg-solar-500/10',
  },
  error: {
    dot: 'bg-flare-500',
    ring: 'border-flare-500',
    glow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    text: 'text-flare-400',
    bg: 'bg-flare-500/10',
  },
  info: {
    dot: 'bg-plasma-500',
    ring: 'border-plasma-500',
    glow: 'shadow-[0_0_8px_rgba(59,125,209,0.5)]',
    text: 'text-plasma-400',
    bg: 'bg-plasma-500/10',
  },
};

const sizeConfig = {
  sm: { dot: 'h-1.5 w-1.5', ring: 'h-3 w-3', text: 'text-2xs', padding: 'px-2 py-0.5' },
  md: { dot: 'h-2 w-2', ring: 'h-4 w-4', text: 'text-xs', padding: 'px-2.5 py-1' },
  lg: { dot: 'h-2.5 w-2.5', ring: 'h-5 w-5', text: 'text-sm', padding: 'px-3 py-1.5' },
};

export const LiveIndicator: Component<LiveIndicatorProps> = props => {
  const color = () => colorConfig[props.color || 'success'];
  const size = () => sizeConfig[props.size || 'md'];
  const variant = () => props.variant || 'pulse';
  const showLabel = () => props.showLabel !== false;

  return (
    <div
      class={cn(
        'inline-flex items-center gap-2 rounded-full font-bold tracking-wider uppercase',
        color().bg,
        size().padding,
        size().text,
        color().text,
        props.class
      )}
    >
      <div class="relative">
        {variant() === 'pulse' && (
          <>
            <div class={cn('rounded-full', size().dot, color().dot)} />
            <div
              class={cn(
                'absolute inset-0 animate-ping rounded-full opacity-75',
                size().dot,
                color().dot
              )}
            />
          </>
        )}

        {variant() === 'ring' && (
          <div class="relative">
            <div class={cn('rounded-full', size().dot, color().dot, color().glow)} />
            <div
              class={cn(
                'absolute inset-[-4px] animate-[ring-expand_1.5s_ease-out_infinite] rounded-full border-2',
                color().ring,
                'opacity-50'
              )}
            />
          </div>
        )}

        {variant() === 'dot' && (
          <div class={cn('rounded-full', size().dot, color().dot, color().glow)} />
        )}

        {variant() === 'bar' && (
          <div class="flex gap-0.5">
            <For each={[0, 1, 2]}>
              {i => (
                <div
                  class={cn('w-0.5 rounded-full', color().dot)}
                  style={{
                    height: '8px',
                    animation: `data-pulse 1s ease-in-out ${i * 0.15}s infinite`,
                  }}
                />
              )}
            </For>
          </div>
        )}
      </div>

      <Show when={showLabel()}>
        <span>{props.label || 'Live'}</span>
      </Show>

      <Show when={props.count !== undefined}>
        <span class="font-mono tabular-nums">{props.count}</span>
      </Show>
    </div>
  );
};
