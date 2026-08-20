import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import GlassCard from '../../ui/GlassCard';
import { Globe } from '../../ui/Icons';

interface RegionData {
  dimension: string; // Country code or region
  count: number;
}

interface GlobalPresenceProps {
  data: RegionData[];
  totalNodes: number;
}

export const GlobalPresence: Component<GlobalPresenceProps> = props => {
  return (
    <GlassCard class="p-8">
      <div class="mb-6 flex items-center justify-between">
        <h3 class="text-lg font-bold tracking-widest text-white uppercase">Global Footprint</h3>
        <Globe size={20} class="text-indigo-400" />
      </div>

      <div class="space-y-4">
        <div class="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-indigo-500/10 bg-indigo-500/5">
          {/* Abstract world map representation */}
          <div class="absolute inset-0 flex flex-wrap gap-1 p-2 opacity-10">
            <For each={Array.from({ length: 120 })}>
              {() => <div class="h-1 w-1 rounded-full bg-indigo-400" />}
            </For>
          </div>
          <div class="relative z-10 text-center">
            <div class="text-2xl font-black text-white">{props.data.length}</div>
            <div class="text-[10px] font-bold tracking-tighter text-slate-500 uppercase">
              Active Regions
            </div>
          </div>
        </div>

        <div class="no-scrollbar max-h-[160px] space-y-3 overflow-y-auto pt-2">
          <For each={props.data}>
            {region => (
              <div>
                <div class="mb-1.5 flex justify-between text-[10px] font-black tracking-widest uppercase">
                  <span class="text-slate-400">{region.dimension || 'Unknown'}</span>
                  <span class="text-white">{region.count} nodes</span>
                </div>
                <div class="h-1 overflow-hidden rounded-full bg-white/[0.03]">
                  <div
                    class="h-full bg-indigo-500 transition-all duration-1000"
                    style={{ width: `${(region.count / (props.totalNodes || 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </For>
          <Show when={props.data.length === 0}>
            <div class="py-4 text-center text-xs font-medium text-slate-500 italic">
              Waiting for regional telemetry...
            </div>
          </Show>
        </div>
      </div>
    </GlassCard>
  );
};
