import { type Component, For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Globe, TrendingUp, ChevronDown, ChevronUp } from 'lucide-solid';
import { cn } from '~/lib/prelude';

interface GeoData {
  country_code: string;
  country_name?: string;
  user_count: number;
  percentage?: number;
}

interface GeoDistributionProps {
  data: GeoData[];
  maxItems?: number;
}

const COUNTRY_NAMES = {
  US: 'United States',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  CA: 'Canada',
  AU: 'Australia',
  JP: 'Japan',
  IN: 'India',
  BR: 'Brazil',
  NL: 'Netherlands',
  SE: 'Sweden',
  ES: 'Spain',
  IT: 'Italy',
  PL: 'Poland',
  RU: 'Russia',
  CN: 'China',
  KR: 'South Korea',
  MX: 'Mexico',
  AR: 'Argentina',
  ZA: 'South Africa',
  SG: 'Singapore',
  HK: 'Hong Kong',
  TW: 'Taiwan',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  CH: 'Switzerland',
  AT: 'Austria',
  BE: 'Belgium',
  IE: 'Ireland',
  NZ: 'New Zealand',
  PT: 'Portugal',
  CZ: 'Czech Republic',
  IL: 'Israel',
  UA: 'Ukraine',
  RO: 'Romania',
  TR: 'Turkey',
  TH: 'Thailand',
  VN: 'Vietnam',
  PH: 'Philippines',
  ID: 'Indonesia',
  MY: 'Malaysia',
  CL: 'Chile',
  CO: 'Colombia',
  PE: 'Peru',
} satisfies Record<string, string>;

const COUNTRY_FLAGS = {
  US: '🇺🇸',
  GB: '🇬🇧',
  DE: '🇩🇪',
  FR: '🇫🇷',
  CA: '🇨🇦',
  AU: '🇦🇺',
  JP: '🇯🇵',
  IN: '🇮🇳',
  BR: '🇧🇷',
  NL: '🇳🇱',
  SE: '🇸🇪',
  ES: '🇪🇸',
  IT: '🇮🇹',
  PL: '🇵🇱',
  RU: '🇷🇺',
  CN: '🇨🇳',
  KR: '🇰🇷',
  MX: '🇲🇽',
  AR: '🇦🇷',
  ZA: '🇿🇦',
  SG: '🇸🇬',
  HK: '🇭🇰',
  TW: '🇹🇼',
  NO: '🇳🇴',
  DK: '🇩🇰',
  FI: '🇫🇮',
  CH: '🇨🇭',
  AT: '🇦🇹',
  BE: '🇧🇪',
  IE: '🇮🇪',
  NZ: '🇳🇿',
  PT: '🇵🇹',
  CZ: '🇨🇿',
  IL: '🇮🇱',
  UA: '🇺🇦',
  RO: '🇷🇴',
  TR: '🇹🇷',
  TH: '🇹🇭',
  VN: '🇻🇳',
  PH: '🇵🇭',
  ID: '🇮🇩',
  MY: '🇲🇾',
  CL: '🇨🇱',
  CO: '🇨🇴',
  PE: '🇵🇪',
} satisfies Record<string, string>;

const REGION_COLORS = [
  {
    gradient: 'linear-gradient(135deg, var(--color-indigo-600), var(--color-indigo-400))',
    glow: 'rgba(99, 102, 241, 0.4)',
  },
  {
    gradient: 'linear-gradient(135deg, var(--color-electric-600), var(--color-electric-400))',
    glow: 'rgba(34, 211, 211, 0.4)',
  },
  {
    gradient: 'linear-gradient(135deg, var(--color-aurora-600), var(--color-aurora-400))',
    glow: 'rgba(16, 185, 129, 0.4)',
  },
  {
    gradient: 'linear-gradient(135deg, var(--color-photon-600), var(--color-photon-400))',
    glow: 'rgba(176, 109, 232, 0.4)',
  },
  {
    gradient: 'linear-gradient(135deg, var(--color-solar-600), var(--color-solar-400))',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
] as const;

function lookupTable(table: Record<string, string>, code: string, fallback: string) {
  return Object.hasOwn(table, code) ? table[code] : fallback;
}

function regionColor(index: number) {
  return REGION_COLORS[index % REGION_COLORS.length] ?? REGION_COLORS[0];
}

export const GeoDistribution: Component<GeoDistributionProps> = props => {
  const [mounted, setMounted] = createSignal(false);
  const [showAll, setShowAll] = createSignal(false);

  onMount(() => {
    const animationFrame = requestAnimationFrame(() => setMounted(true));
    onCleanup(() => cancelAnimationFrame(animationFrame));
  });

  const maxItems = () => props.maxItems ?? 10;

  const sortedData = createMemo(() =>
    [...props.data].toSorted((a, b) => b.user_count - a.user_count)
  );

  const displayedData = createMemo(() =>
    showAll() ? sortedData() : sortedData().slice(0, maxItems())
  );

  const totalUsers = createMemo(() => props.data.reduce((sum, item) => sum + item.user_count, 0));

  const maxUsers = createMemo(() => Math.max(...props.data.map(d => d.user_count), 1));

  const getCountryName = (code: string) => lookupTable(COUNTRY_NAMES, code, code);

  const getFlag = (code: string) => lookupTable(COUNTRY_FLAGS, code, '🌍');

  const getPercentage = (count: number) =>
    totalUsers() > 0 ? ((count / totalUsers()) * 100).toFixed(1) : '0';

  const getBarWidth = (count: number) => (count / maxUsers()) * 100;

  const geographicInsight = createMemo(() => {
    const topCountry = sortedData().at(0);
    return topCountry === undefined
      ? 'Geographic distribution data will help identify key markets.'
      : `${getCountryName(topCountry.country_code)} leads with ${getPercentage(topCountry.user_count)}% of users. Consider localization for top markets.`;
  });

  const topRegions = createMemo(() => {
    const regions = {
      'North America': ['US', 'CA', 'MX'],
      Europe: [
        'GB',
        'DE',
        'FR',
        'NL',
        'SE',
        'ES',
        'IT',
        'PL',
        'NO',
        'DK',
        'FI',
        'CH',
        'AT',
        'BE',
        'IE',
        'PT',
        'CZ',
        'UA',
        'RO',
      ],
      'Asia Pacific': [
        'JP',
        'IN',
        'CN',
        'KR',
        'SG',
        'HK',
        'TW',
        'TH',
        'VN',
        'PH',
        'ID',
        'MY',
        'AU',
        'NZ',
      ],
      'Latin America': ['BR', 'AR', 'CL', 'CO', 'PE'],
      Other: ['RU', 'ZA', 'IL', 'TR'],
    };

    const regionCounts: { name: string; count: number }[] = [];

    for (const [name, codes] of Object.entries(regions)) {
      const count = props.data
        .filter(d => codes.includes(d.country_code))
        .reduce((sum, d) => sum + d.user_count, 0);
      if (count > 0) {
        regionCounts.push({ name, count });
      }
    }

    return regionCounts.toSorted((a, b) => b.count - a.count);
  });

  return (
    <div class="bg-void-900 relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 shadow-2xl">
      <div
        class="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-15 blur-3xl transition-opacity duration-500"
        style={{ background: 'var(--color-indigo-500)' }}
      />

      <div class="relative mb-6 flex items-start justify-between">
        <div>
          <div class="mb-1 flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-indigo-600), var(--color-indigo-400))',
                'box-shadow': '0 0 15px rgba(99, 102, 241, 0.3)',
              }}
            >
              <Globe size={20} class="text-white" />
            </div>
            <div>
              <h3 class="text-nebula-100 text-lg font-bold tracking-tight">
                Geographic Distribution
              </h3>
              <p class="text-nebula-500 text-xs">
                <span class="text-nebula-300 font-bold">{totalUsers().toLocaleString()}</span> users
                across <span class="text-nebula-300 font-bold">{props.data.length}</span> countries
              </p>
            </div>
          </div>
        </div>
      </div>

      <Show when={props.data.length === 0}>
        <div class="flex flex-col items-center justify-center py-12">
          <div class="bg-void-800 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <Globe size={32} class="text-nebula-600" />
          </div>
          <p class="text-nebula-200 text-lg font-bold">No Geographic Data</p>
          <p class="text-nebula-500 mt-1 text-sm">Location data will appear once users connect</p>
        </div>
      </Show>

      <Show when={props.data.length > 0}>
        <div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <For each={topRegions().slice(0, 4)}>
            {(region, index) => {
              const colors = regionColor(index());
              const percentage =
                totalUsers() > 0 ? ((region.count / totalUsers()) * 100).toFixed(0) : '0';

              return (
                <div
                  class={cn(
                    'bg-void-800/40 rounded-xl border border-white/[0.06] p-3',
                    'transition-all duration-300'
                  )}
                >
                  <p class="text-nebula-500 mb-1 text-[10px] font-bold tracking-wider uppercase">
                    {region.name}
                  </p>
                  <div class="flex items-baseline gap-2">
                    <span class="text-nebula-100 text-xl font-black">{percentage}%</span>
                    <span class="text-nebula-500 text-xs">{region.count.toLocaleString()}</span>
                  </div>
                  <div class="bg-void-700 mt-2 h-1 overflow-hidden rounded-full">
                    <div
                      class="h-full rounded-full transition-all duration-700"
                      style={{
                        width: mounted() ? `${percentage}%` : '0%',
                        background: colors.gradient,
                      }}
                    />
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        <div
          class={cn(
            'space-y-2 transition-all duration-500',
            mounted() ? 'opacity-100' : 'opacity-0'
          )}
        >
          <For each={displayedData()}>
            {(country, index) => {
              const barWidth = getBarWidth(country.user_count);
              const isTopThree = index() < 3;
              const colors = regionColor(index());

              return (
                <div
                  class={cn(
                    'group bg-void-800/30 relative rounded-xl border p-3',
                    'cursor-default border-white/[0.04] transition-all duration-300',
                    'hover:bg-void-750/50 hover:border-white/10'
                  )}
                  style={{
                    'animation-delay': `${index() * 30}ms`,
                  }}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg text-lg',
                        'transition-transform duration-300 group-hover:scale-110'
                      )}
                      style={{
                        background: isTopThree ? colors.gradient : 'var(--color-void-700)',
                      }}
                    >
                      {isTopThree ? (
                        <span class="text-sm">{getFlag(country.country_code)}</span>
                      ) : (
                        <span class="text-nebula-400 text-xs font-bold">{index() + 1}</span>
                      )}
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-nebula-200 truncate text-sm font-semibold">
                          {getCountryName(country.country_code)}
                        </span>
                        <Show when={!isTopThree}>
                          <span class="text-sm">{getFlag(country.country_code)}</span>
                        </Show>
                        <Show when={isTopThree}>
                          <span
                            class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                            style={{
                              background: colors.glow,
                              color: 'white',
                            }}
                          >
                            Top {index() + 1}
                          </span>
                        </Show>
                      </div>
                      <div class="bg-void-700 mt-1.5 h-1.5 overflow-hidden rounded-full">
                        <div
                          class={cn(
                            'h-full rounded-full transition-all duration-700',
                            mounted() ? 'opacity-100' : 'opacity-0'
                          )}
                          style={{
                            width: mounted() ? `${barWidth}%` : '0%',
                            background: isTopThree ? colors.gradient : 'var(--color-nebula-600)',
                          }}
                        />
                      </div>
                    </div>

                    <div class="shrink-0 text-right">
                      <p class="text-nebula-100 text-sm font-bold tabular-nums">
                        {country.user_count.toLocaleString()}
                      </p>
                      <p class="text-nebula-500 text-[10px] tabular-nums">
                        {getPercentage(country.user_count)}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        <Show when={sortedData().length > maxItems()}>
          <button
            type="button"
            onClick={() => setShowAll(!showAll())}
            class={cn(
              'mt-4 w-full rounded-xl py-2.5 text-sm font-medium',
              'bg-void-800/30 border border-white/[0.06]',
              'text-nebula-400 hover:text-nebula-200',
              'hover:bg-void-750/50 transition-all duration-200',
              'flex items-center justify-center gap-2'
            )}
          >
            {showAll() ? (
              <>
                <ChevronUp size={16} />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                Show All {sortedData().length} Countries
              </>
            )}
          </button>
        </Show>

        <div class="bg-void-800/30 mt-6 rounded-xl border border-white/[0.06] p-4">
          <div class="flex items-center gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(99, 102, 241, 0.15)' }}
            >
              <TrendingUp size={14} class="text-indigo-400" />
            </div>
            <div>
              <p class="text-nebula-100 text-sm font-semibold">Geographic Insight</p>
              <p class="text-nebula-400 mt-0.5 text-xs">{geographicInsight()}</p>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
