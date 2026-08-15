import { Component, JSX, Show } from 'solid-js';
import GlassCard from '../../ui/GlassCard';
import { TrendingUp, TrendingDown } from '../../ui/Icons';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: JSX.Element;
  trend?: {
    value: number;
    isUp: boolean;
  };
  description?: string;
  class?: string;
}

export const StatCard: Component<StatCardProps> = props => {
  return (
    <GlassCard class={`p-6 ${props.class || ''}`}>
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs font-bold tracking-widest text-slate-500 uppercase">{props.title}</p>
          <h3 class="mt-2 text-3xl font-black tracking-tight text-white">{props.value}</h3>

          <Show when={props.trend}>
            <div
              class={`mt-2 flex items-center gap-1 text-xs font-bold ${props.trend!.isUp ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              <Show when={props.trend!.isUp} fallback={<TrendingDown size={14} />}>
                <TrendingUp size={14} />
              </Show>
              <span>
                {props.trend!.isUp ? '+' : ''}
                {props.trend!.value}%
              </span>
              <span class="font-medium text-slate-500">vs last period</span>
            </div>
          </Show>
        </div>
        <div class="rounded-xl bg-white/5 p-3 text-white">{props.icon}</div>
      </div>
      <Show when={props.description}>
        <p class="text-opacity-80 mt-4 text-xs font-medium text-slate-400">{props.description}</p>
      </Show>
    </GlassCard>
  );
};
