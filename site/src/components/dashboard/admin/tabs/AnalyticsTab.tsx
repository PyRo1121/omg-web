import { type Component, Show, For } from 'solid-js';
import {
  Globe,
  Eye,
  Users,
  Activity,
  TrendingUp,
  FileCode,
  ExternalLink,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-solid';
import { CardSkeleton } from '../../../ui/Skeleton';
import ErrorCard from '../shared/ErrorCard';
import { DocsAnalytics } from '../DocsAnalytics';
import { CohortAnalysis } from '../CohortAnalysis';
import type { SiteAnalyticsOverview, SiteGeoAnalytics, SiteRealtimeAnalytics } from '~/lib/api';

type DateRange = '7d' | '30d' | '90d' | 'custom';

function getDateRangeDays(range: DateRange): number {
  switch (range) {
    case '7d':
      return 7;
    case '90d':
      return 90;
    default:
      return 30;
  }
}

function getDateRangeLabel(range: DateRange): string {
  switch (range) {
    case '7d':
      return '7 Days';
    case '90d':
      return '90 Days';
    default:
      return '30 Days';
  }
}

function getColorName(color: string): string {
  switch (color) {
    case 'photon':
      return 'photon';
    case 'electric':
      return 'electric';
    case 'aurora':
      return 'aurora';
    default:
      return 'indigo';
  }
}

function getDeviceColorConfig(deviceType: string | undefined) {
  switch (deviceType) {
    case 'mobile':
      return { text: 'text-aurora-400', bg: 'bg-aurora-500/10', glow: 'bg-aurora-500/20' };
    case 'tablet':
      return { text: 'text-photon-400', bg: 'bg-photon-500/10', glow: 'bg-photon-500/20' };
    default:
      return { text: 'text-electric-400', bg: 'bg-electric-500/10', glow: 'bg-electric-500/20' };
  }
}

interface AnalyticsTabProps {
  dateRange: DateRange;
  siteOverview: SiteAnalyticsOverview | undefined;
  siteGeo: SiteGeoAnalytics | undefined;
  realtimeData: SiteRealtimeAnalytics | undefined;
  isOverviewLoading: boolean;
  isRealtimeLoading: boolean;
  isOverviewSuccess: boolean;
  isRealtimeSuccess: boolean;
  isOverviewError?: boolean;
  isRealtimeError?: boolean;
  onRetryOverview?: () => void;
  onRetryRealtime?: () => void;
}

export const AnalyticsTab: Component<AnalyticsTabProps> = props => {
  return (
    <div class="space-y-10">
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="from-electric-500 to-photon-600 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br">
              <Globe size={24} class="text-white" />
            </div>
            <div>
              <h2 class="font-display text-2xl font-black tracking-tight text-white">
                Site Traffic
              </h2>
              <p class="text-nebula-400 text-sm">Website analytics and visitor insights</p>
            </div>
          </div>
          <Show when={props.realtimeData?.active_visitors}>
            <div class="border-aurora-500/30 bg-aurora-500/10 shadow-aurora-500/10 relative flex items-center gap-3 rounded-2xl border px-5 py-2.5 shadow-lg">
              <div class="from-aurora-500/5 absolute inset-0 rounded-2xl bg-gradient-to-r to-transparent" />
              <div class="relative flex h-4 w-4 items-center justify-center">
                <div class="bg-aurora-500 absolute h-full w-full animate-ping rounded-full opacity-75" />
                <div class="bg-aurora-400 shadow-aurora-500/50 h-2.5 w-2.5 rounded-full shadow-lg" />
              </div>
              <span class="font-display text-aurora-400 relative text-2xl font-black tabular-nums">
                {props.realtimeData?.active_visitors?.toLocaleString()}
              </span>
              <span class="text-aurora-400/70 relative text-xs font-bold tracking-wider uppercase">
                live now
              </span>
            </div>
          </Show>
        </div>

        <Show when={props.isOverviewLoading || props.isRealtimeLoading}>
          <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </Show>

        <Show when={props.isOverviewError}>
          <ErrorCard
            title="Failed to Load Analytics"
            message="Unable to fetch site analytics data. Please try again."
            onRetry={props.onRetryOverview}
          />
        </Show>

        <Show when={props.isOverviewSuccess || props.isRealtimeSuccess}>
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total pageviews"
              value={props.siteOverview?.summary?.total_pageviews}
              icon={Eye}
              color="indigo"
              period={props.dateRange}
            />
            <StatCard
              label="Unique visitors"
              value={props.siteOverview?.summary?.total_visitors}
              icon={Users}
              color="photon"
            />
            <StatCard
              label="Total sessions"
              value={props.siteOverview?.summary?.total_sessions}
              icon={Activity}
              color="electric"
            />
            <StatCard
              label="Daily pageviews"
              value={Math.round(
                (props.siteOverview?.summary?.total_pageviews || 0) /
                  getDateRangeDays(props.dateRange)
              )}
              icon={TrendingUp}
              color="aurora"
            />
          </div>

          <Show when={(props.realtimeData?.top_pages?.length || 0) > 0}>
            <div class="border-aurora-500/30 bg-void-850 shadow-aurora-500/5 relative overflow-hidden rounded-2xl border shadow-lg">
              <div class="from-aurora-500/10 to-electric-500/5 absolute inset-0 bg-gradient-to-r via-transparent" />
              <div class="bg-aurora-500/20 pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full blur-[40px]" />
              <div class="border-aurora-500/20 from-aurora-500/5 relative border-b bg-gradient-to-r to-transparent px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="relative flex h-3 w-3 items-center justify-center">
                    <div class="bg-aurora-500 absolute h-full w-full animate-ping rounded-full opacity-75" />
                    <div class="bg-aurora-400 shadow-aurora-500/50 h-2 w-2 rounded-full shadow-lg" />
                  </div>
                  <h4 class="font-display text-aurora-400 text-sm font-black tracking-wider uppercase">
                    Live: Active Pages
                  </h4>
                  <span class="bg-aurora-500/10 text-2xs text-aurora-400/70 ml-auto rounded-full px-2 py-0.5 font-bold">
                    {props.realtimeData?.top_pages?.length} pages
                  </span>
                </div>
              </div>
              <div class="relative flex flex-wrap gap-2 p-4">
                <For each={props.realtimeData?.top_pages?.slice(0, 8)}>
                  {page => (
                    <div class="group border-aurora-500/20 bg-aurora-500/5 hover:border-aurora-500/40 hover:bg-aurora-500/10 flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200">
                      <span class="text-aurora-300 group-hover:text-aurora-200 font-mono text-xs font-medium transition-colors">
                        {page.page_path}
                      </span>
                      <span class="bg-aurora-500/20 font-display text-2xs text-aurora-400 rounded-lg px-2 py-0.5 font-black tabular-nums shadow-sm">
                        {page.count}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="grid gap-6 lg:grid-cols-2">
            <TopPagesCard pages={props.siteOverview?.top_pages} />
            <TrafficSourcesCard referrers={props.siteOverview?.top_referrers} />
          </div>

          <DeviceBreakdownCard devices={props.siteOverview?.device_breakdown} />

          <Show when={(props.siteGeo?.geo_distribution?.length || 0) > 0}>
            <GeoDistributionCard
              geoData={props.siteGeo?.geo_distribution}
              totalCountries={props.siteGeo?.total_countries}
              totalEngagement={props.siteGeo?.total_engagement}
            />
          </Show>
        </Show>
      </div>

      <DocsAnalytics />
      <CohortAnalysis />
    </div>
  );
};

const StatCard: Component<{
  label: string;
  value: number | undefined;
  icon: Component<{ class?: string; size?: number }>;
  color: string;
  period?: DateRange;
}> = props => {
  const c = getColorName(props.color);

  return (
    <div class="group bg-void-850 shadow-card hover:shadow-card-hover relative overflow-hidden rounded-3xl border border-white/5 p-6 transition-all duration-300 hover:border-white/10">
      <div
        class={`pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-${c}-500/20 opacity-70 blur-[40px] transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div class="relative">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Show when={props.period}>
              <span class="text-2xs text-nebula-500 font-black tracking-widest uppercase">
                {getDateRangeLabel(props.period ?? '30d')}
              </span>
            </Show>
          </div>
          <div
            class={`flex h-10 w-10 items-center justify-center rounded-xl bg-${c}-500/10 transition-transform duration-300 group-hover:scale-110`}
          >
            <props.icon size={18} class={`text-${c}-400`} />
          </div>
        </div>
        <div class="mt-3 flex items-baseline gap-1">
          <span class="font-display text-4xl font-black tracking-tight text-white tabular-nums">
            {props.value?.toLocaleString() || '0'}
          </span>
        </div>
        <p class="text-nebula-500 mt-2 text-xs font-medium">{props.label}</p>
      </div>
    </div>
  );
};

const TopPagesCard: Component<{
  pages: Array<{ path: string; views: number }> | undefined;
}> = props => (
  <div class="bg-void-850 shadow-card relative overflow-hidden rounded-3xl border border-white/5">
    <div class="pointer-events-none absolute -top-16 -left-16 h-32 w-32 rounded-full bg-indigo-500/10 blur-[60px]" />
    <div class="relative border-b border-white/5 bg-gradient-to-r from-indigo-500/5 to-transparent p-5">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
          <FileCode size={18} class="text-indigo-400" />
        </div>
        <div>
          <h4 class="font-display text-sm font-black tracking-wider text-white uppercase">
            Top Pages
          </h4>
          <p class="text-2xs text-nebula-500">Most visited pages</p>
        </div>
      </div>
    </div>
    <div class="relative max-h-[400px] overflow-y-auto" style={{ 'scrollbar-width': 'none' }}>
      <Show
        when={(props.pages?.length || 0) > 0}
        fallback={
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <FileCode size={32} class="text-nebula-600 mb-3" />
            <p class="text-nebula-500 text-sm font-medium">No page data yet</p>
          </div>
        }
      >
        <For each={props.pages?.slice(0, 15)}>
          {(page, i) => (
            <div class="group flex items-center justify-between border-b border-white/[0.03] px-5 py-3.5 transition-all duration-200 hover:bg-white/[0.03]">
              <div class="flex items-center gap-3">
                <span class="font-display flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 text-xs font-black text-indigo-400 tabular-nums">
                  {i() + 1}
                </span>
                <span class="max-w-[220px] truncate font-mono text-xs font-medium text-white transition-colors group-hover:text-indigo-300">
                  {page.path}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-display text-sm font-black text-white tabular-nums">
                  {page.views?.toLocaleString()}
                </span>
                <span class="text-2xs text-nebula-500 font-medium">views</span>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  </div>
);

const TrafficSourcesCard: Component<{
  referrers: Array<{ referrer_domain: string | null; visitors: number }> | undefined;
}> = props => (
  <div class="bg-void-850 shadow-card relative overflow-hidden rounded-3xl border border-white/5">
    <div class="bg-photon-500/10 pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full blur-[60px]" />
    <div class="from-photon-500/5 relative border-b border-white/5 bg-gradient-to-r to-transparent p-5">
      <div class="flex items-center gap-3">
        <div class="bg-photon-500/10 flex h-10 w-10 items-center justify-center rounded-xl">
          <ExternalLink size={18} class="text-photon-400" />
        </div>
        <div>
          <h4 class="font-display text-sm font-black tracking-wider text-white uppercase">
            Traffic Sources
          </h4>
          <p class="text-2xs text-nebula-500">Where visitors come from</p>
        </div>
      </div>
    </div>
    <div class="relative max-h-[400px] overflow-y-auto" style={{ 'scrollbar-width': 'none' }}>
      <Show
        when={(props.referrers?.length || 0) > 0}
        fallback={
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <ExternalLink size={32} class="text-nebula-600 mb-3" />
            <p class="text-nebula-500 text-sm font-medium">No referrer data yet</p>
          </div>
        }
      >
        <For each={props.referrers?.slice(0, 15)}>
          {(ref, i) => (
            <div class="group flex items-center justify-between border-b border-white/[0.03] px-5 py-3.5 transition-all duration-200 hover:bg-white/[0.03]">
              <div class="flex items-center gap-3">
                <span class="from-photon-500/20 to-photon-600/10 font-display text-photon-400 flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-black tabular-nums">
                  {i() + 1}
                </span>
                <span class="group-hover:text-photon-300 max-w-[220px] truncate text-xs font-medium text-white transition-colors">
                  {ref.referrer_domain || 'Direct'}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-display text-sm font-black text-white tabular-nums">
                  {ref.visitors?.toLocaleString()}
                </span>
                <span class="text-2xs text-nebula-500 font-medium">visitors</span>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  </div>
);

const DeviceBreakdownCard: Component<{
  devices: Array<{ device_type: string; visitors: number }> | undefined;
}> = props => (
  <div class="bg-void-850 shadow-card relative overflow-hidden rounded-3xl border border-white/5 p-6">
    <div class="bg-electric-500/10 pointer-events-none absolute -top-16 -left-16 h-32 w-32 rounded-full blur-[60px]" />
    <div class="relative mb-6 flex items-center gap-3">
      <div class="bg-electric-500/10 flex h-10 w-10 items-center justify-center rounded-xl">
        <Monitor size={20} class="text-electric-400" />
      </div>
      <div>
        <h4 class="font-display text-sm font-black tracking-wider text-white uppercase">
          Device Breakdown
        </h4>
        <p class="text-2xs text-nebula-500">Visitor distribution by device</p>
      </div>
    </div>
    <Show
      when={(props.devices?.length || 0) > 0}
      fallback={
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <Monitor size={32} class="text-nebula-600 mb-3" />
          <p class="text-nebula-500 text-sm font-medium">No device data yet</p>
        </div>
      }
    >
      <div class="relative flex flex-wrap gap-6">
        <For each={props.devices}>
          {device => {
            const total = props.devices?.reduce((sum, d) => sum + (d.visitors || 0), 0) || 1;
            const percentage = ((device.visitors || 0) / total) * 100;
            const DeviceIcon =
              device.device_type === 'mobile'
                ? Smartphone
                : device.device_type === 'tablet'
                  ? Tablet
                  : Monitor;
            const colorConfig = getDeviceColorConfig(device.device_type);

            return (
              <div class="group relative flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]">
                <div
                  class="pointer-events-none absolute -top-4 -right-4 h-12 w-12 rounded-full opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100"
                  classList={{ [colorConfig.glow]: true }}
                />
                <div class={`relative rounded-xl p-3 ${colorConfig.bg}`}>
                  <DeviceIcon size={24} class={colorConfig.text} />
                </div>
                <div class="relative">
                  <div class="flex items-baseline gap-2">
                    <span class="font-display text-3xl font-black tracking-tight text-white tabular-nums">
                      {device.visitors?.toLocaleString()}
                    </span>
                    <span class={`text-sm font-bold ${colorConfig.text}`}>
                      ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <p class="text-nebula-500 mt-1 text-xs font-bold tracking-wider uppercase">
                    {device.device_type || 'Desktop'}
                  </p>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  </div>
);

const GeoDistributionCard: Component<{
  geoData: Array<{ country_code: string; user_count: number; percentage: number }> | undefined;
  totalCountries: number | undefined;
  totalEngagement: number | undefined;
}> = props => (
  <div class="bg-void-850 shadow-card relative overflow-hidden rounded-3xl border border-white/5 p-6">
    <div class="pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full bg-indigo-500/10 blur-[60px]" />
    <div class="bg-photon-500/10 pointer-events-none absolute -bottom-16 -left-16 h-32 w-32 rounded-full blur-[60px]" />
    <div class="relative mb-6 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="to-photon-500/20 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20">
          <Globe size={20} class="text-indigo-400" />
        </div>
        <div>
          <h4 class="font-display text-sm font-black tracking-wider text-white uppercase">
            Geographic Distribution
          </h4>
          <p class="text-2xs text-nebula-500">Visitors by country</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="rounded-xl bg-white/[0.03] px-3 py-1.5">
          <span class="font-display text-sm font-black text-white tabular-nums">
            {props.totalCountries || 0}
          </span>
          <span class="text-2xs text-nebula-500 ml-1 font-medium">countries</span>
        </div>
        <div class="rounded-xl bg-white/[0.03] px-3 py-1.5">
          <span class="font-display text-sm font-black text-white tabular-nums">
            {props.totalEngagement?.toLocaleString() || 0}
          </span>
          <span class="text-2xs text-nebula-500 ml-1 font-medium">total</span>
        </div>
      </div>
    </div>
    <div class="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <For each={props.geoData?.slice(0, 12)}>
        {(geo, i) => {
          const hue = 230 + i() * 12;
          return (
            <div class="group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.05]">
              <div class="flex items-center gap-3">
                <span class="text-xl">
                  {geo.country_code && geo.country_code.length === 2
                    ? String.fromCodePoint(
                        ...geo.country_code
                          .toUpperCase()
                          .split('')
                          .map(c => 127397 + c.charCodeAt(0))
                      )
                    : '🌍'}
                </span>
                <span class="text-nebula-300 text-xs font-bold">{geo.country_code}</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="bg-void-700 h-2 w-20 overflow-hidden rounded-full">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${geo.percentage}%`,
                      background: `linear-gradient(90deg, hsl(${hue}, 80%, 55%), hsl(${hue + 20}, 70%, 45%))`,
                    }}
                  />
                </div>
                <span class="font-display w-14 text-right text-sm font-black text-white tabular-nums">
                  {geo.user_count?.toLocaleString()}
                </span>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  </div>
);
