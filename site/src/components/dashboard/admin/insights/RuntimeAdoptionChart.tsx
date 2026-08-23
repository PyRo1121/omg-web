import { type Component, For, Show, createSignal, createMemo, onCleanup, onMount } from 'solid-js';
import { Repeat, Users, Activity, Clock, Zap, Trophy } from 'lucide-solid';
import { cn } from '~/lib/prelude';

interface RuntimeData {
  runtime: string;
  unique_users: number;
  total_uses: number;
  avg_duration_ms: number;
}

interface RuntimeAdoptionChartProps {
  data: ReadonlyArray<RuntimeData>;
}

const runtimeColors = {
  node: {
    gradient: 'linear-gradient(135deg, #5FA04E, #8CC84B)',
    glow: 'rgba(95, 160, 78, 0.5)',
    accent: '#8CC84B',
  },
  python: {
    gradient: 'linear-gradient(135deg, #306998, #FFD43B)',
    glow: 'rgba(255, 212, 59, 0.4)',
    accent: '#FFD43B',
  },
  rust: {
    gradient: 'linear-gradient(135deg, #CE412B, #F46623)',
    glow: 'rgba(244, 102, 35, 0.5)',
    accent: '#F46623',
  },
  go: {
    gradient: 'linear-gradient(135deg, #00ADD8, #00D8FF)',
    glow: 'rgba(0, 216, 255, 0.4)',
    accent: '#00D8FF',
  },
  ruby: {
    gradient: 'linear-gradient(135deg, #CC342D, #FF6B6B)',
    glow: 'rgba(255, 107, 107, 0.4)',
    accent: '#FF6B6B',
  },
  java: {
    gradient: 'linear-gradient(135deg, #E76F00, #F89820)',
    glow: 'rgba(248, 152, 32, 0.4)',
    accent: '#F89820',
  },
  bun: {
    gradient: 'linear-gradient(135deg, #FBF0DF, #F9D9A5)',
    glow: 'rgba(251, 240, 223, 0.4)',
    accent: '#FBF0DF',
  },
  deno: {
    gradient: 'linear-gradient(135deg, #12124B, #5C5CD6)',
    glow: 'rgba(92, 92, 214, 0.4)',
    accent: '#5C5CD6',
  },
  default: {
    gradient: 'linear-gradient(135deg, var(--color-photon-600), var(--color-photon-400))',
    glow: 'var(--color-photon-500)',
    accent: 'var(--color-photon-400)',
  },
} satisfies Record<string, { gradient: string; glow: string; accent: string }>;

const getColorForRuntime = (runtime: string) => {
  const key = runtime.toLowerCase();
  return Object.entries(runtimeColors).find(([name]) => name === key)?.[1] ?? runtimeColors.default;
};

function formatRuntimeDuration(ms: number | undefined | null) {
  const val = ms ?? 0;
  if (val < 1000) {
    return `${Math.round(val)}ms`;
  }
  return `${(val / 1000).toFixed(1)}s`;
}

export const RuntimeAdoptionChart: Component<RuntimeAdoptionChartProps> = props => {
  const [mounted, setMounted] = createSignal(false);
  const [hoveredIndex, setHoveredIndex] = createSignal<number | null>(null);
  const [showAll, setShowAll] = createSignal(false);

  onMount(() => {
    const animationFrame = requestAnimationFrame(() => setMounted(true));
    onCleanup(() => cancelAnimationFrame(animationFrame));
  });

  const sortedRuntimes = createMemo(() =>
    [...(props.data || [])].toSorted((a, b) => (b.unique_users ?? 0) - (a.unique_users ?? 0))
  );

  const displayedRuntimes = createMemo(() =>
    showAll() ? sortedRuntimes() : sortedRuntimes().slice(0, 6)
  );

  const maxUsers = createMemo(() =>
    Math.max(...(props.data || []).map(r => r.unique_users ?? 0), 1)
  );

  const totalUsers = createMemo(() =>
    (props.data || []).reduce((sum, r) => sum + (r.unique_users ?? 0), 0)
  );
  const totalSwitches = createMemo(() =>
    (props.data || []).reduce((sum, r) => sum + (r.total_uses ?? 0), 0)
  );

  const avgSwitchesPerUser = createMemo(() => {
    if (totalUsers() === 0) {
      return 0;
    }
    return totalSwitches() / totalUsers();
  });

  return (
    <div class="bg-void-900 relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 shadow-2xl">
      <div
        class="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-15 blur-3xl transition-all duration-500"
        style={{
          background: (() => {
            const hovered = hoveredIndex();
            if (hovered === null) {
              return 'var(--color-photon-500)';
            }
            return getColorForRuntime(displayedRuntimes()[hovered]?.runtime ?? '').glow;
          })(),
        }}
      />

      <div class="mb-6 flex items-start justify-between">
        <div>
          <div class="mb-1 flex items-center gap-2">
            <Repeat size={20} class="text-photon-400" />
            <h3 class="text-nebula-100 text-lg font-bold tracking-tight">Runtime Adoption</h3>
          </div>
          <p class="text-nebula-500 text-xs">
            <span class="text-nebula-300 font-medium tabular-nums">
              {totalSwitches().toLocaleString()}
            </span>{' '}
            switches across{' '}
            <span class="text-nebula-300 font-medium tabular-nums">
              {totalUsers().toLocaleString()}
            </span>{' '}
            users
          </p>
        </div>

        <div class="flex items-center gap-2">
          <div
            class="rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums"
            style={{
              color: 'var(--color-photon-400)',
              'background-color': 'rgba(176, 109, 232, 0.1)',
              'border-color': 'rgba(176, 109, 232, 0.2)',
            }}
          >
            <Zap size={12} class="mr-1 inline" />
            {avgSwitchesPerUser().toFixed(1)} avg/user
          </div>
        </div>
      </div>

      <Show when={sortedRuntimes().length === 0}>
        <div class="py-12 text-center">
          <div class="bg-void-800 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <Repeat size={24} class="text-nebula-600" />
          </div>
          <p class="text-nebula-400 font-medium">No runtime data available</p>
          <p class="text-nebula-600 mt-1 text-sm">
            Runtime adoption will appear here once users start switching
          </p>
        </div>
      </Show>

      <div class="space-y-2">
        <For each={displayedRuntimes()}>
          {(runtime, index) => {
            const percentage = ((runtime.unique_users ?? 0) / maxUsers()) * 100;
            const colors = getColorForRuntime(runtime.runtime);
            const isHovered = () => hoveredIndex() === index();
            const isTop3 = () => index() < 3;

            return (
              <div
                class={cn(
                  'bg-void-800/40 relative rounded-xl border p-4',
                  'cursor-default transition-all duration-300',
                  'hover:bg-void-750/60',
                  isHovered() && 'border-white/15'
                )}
                style={{
                  'border-color': isHovered()
                    ? `color-mix(in srgb, ${colors.accent} 30%, transparent)`
                    : 'rgba(255,255,255,0.04)',
                  'box-shadow': isHovered()
                    ? `0 0 20px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.03)`
                    : undefined,
                }}
                onMouseEnter={() => setHoveredIndex(index())}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div class="mb-3 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div
                      class={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg text-xs font-black',
                        'transition-all duration-300',
                        isHovered() && 'scale-110'
                      )}
                      style={{
                        background: colors.gradient,
                        color: runtime.runtime.toLowerCase() === 'bun' ? '#1A1A1A' : 'white',
                        'box-shadow': isHovered()
                          ? `0 0 16px ${colors.glow}`
                          : `0 0 8px ${colors.glow}`,
                      }}
                    >
                      {isTop3() ? <Trophy size={16} /> : index() + 1}
                    </div>
                    <div>
                      <p class="text-nebula-200 flex items-center gap-2 text-sm font-semibold capitalize">
                        {runtime.runtime}
                        <Show when={isTop3()}>
                          <span
                            class="text-2xs rounded-full px-1.5 py-0.5"
                            style={{
                              background: colors.glow,
                              color: runtime.runtime.toLowerCase() === 'bun' ? '#1A1A1A' : 'white',
                            }}
                          >
                            Top {index() + 1}
                          </span>
                        </Show>
                      </p>
                      <div class="text-2xs text-nebula-500 mt-0.5 flex items-center gap-3">
                        <span class="flex items-center gap-1">
                          <Users size={10} />
                          {runtime.unique_users.toLocaleString()} users
                        </span>
                        <span class="flex items-center gap-1">
                          <Activity size={10} />
                          {(runtime.total_uses ?? 0).toLocaleString()} uses
                        </span>
                        <span class="flex items-center gap-1">
                          <Clock size={10} />
                          {formatRuntimeDuration(runtime.avg_duration_ms)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="text-right">
                    <p
                      class={cn(
                        'text-xl font-black tabular-nums transition-all duration-300',
                        mounted() ? 'opacity-100' : 'opacity-0'
                      )}
                      style={{ color: colors.accent }}
                    >
                      {percentage.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div class="bg-void-700 h-1.5 overflow-hidden rounded-full">
                  <div
                    class={cn(
                      'h-full rounded-full transition-all duration-1000 ease-out',
                      mounted() ? 'opacity-100' : 'w-0 opacity-0'
                    )}
                    style={{
                      width: mounted() ? `${percentage}%` : '0%',
                      background: colors.gradient,
                      'box-shadow': isHovered() ? `0 0 8px ${colors.glow}` : undefined,
                    }}
                  />
                </div>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={sortedRuntimes().length > 6}>
        <button
          class={cn(
            'mt-4 w-full rounded-lg py-2 text-sm font-medium',
            'bg-void-800/30 border border-white/[0.06]',
            'text-nebula-400 hover:text-nebula-200',
            'hover:bg-void-750/50 transition-all duration-200'
          )}
          onClick={() => setShowAll(!showAll())}
        >
          {showAll() ? 'Show less' : `Show all ${sortedRuntimes().length} runtimes`}
        </button>
      </Show>
    </div>
  );
};
