import { reportClientError, reportClientWarning } from '~/lib/observability';
import { type Component, createMemo, createSignal, onMount, Show, For } from 'solid-js';
import {
  parseGitHubActivity,
  parseGitHubActivityCache,
  type GitHubActivityCache,
} from '../lib/dashboard-contract';
import { GitHubIcon } from './ui/BrandIcons';

// Versioned key so stale shapes are invalidated instead of silently reused.
const CACHE_KEY = 'github-activity-cache.v1';
const CACHE_TTL = 2 * 60 * 1000;

function formatWeekLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function readCachedData(): GitHubActivityCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return null;
    }
    const parsedJson: unknown = JSON.parse(cached);
    const parsed = parseGitHubActivityCache(parsedJson);
    if (!parsed.ok) {
      reportClientWarning('Ignoring invalid GitHub activity cache:', parsed.error);
      return null;
    }
    if (Date.now() - parsed.value.timestamp > CACHE_TTL) {
      return null;
    }
    return parsed.value;
  } catch (err: unknown) {
    if (err instanceof Error) {
      reportClientWarning('Ignoring invalid GitHub activity cache:', err.message);
    }
    return null;
  }
}

function writeCachedData(activity: GitHubActivityCache['data'], total: number): void {
  try {
    const cache: GitHubActivityCache = { data: activity, total, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err: unknown) {
    reportClientWarning('Unable to cache GitHub activity:', err);
  }
}

const GitHubActivity: Component = () => {
  const [data, setData] = createSignal<GitHubActivityCache['data']>([]);
  const [loading, setLoading] = createSignal(true);
  const [totalCommits, setTotalCommits] = createSignal(0);
  const [error, setError] = createSignal<string | null>(null);
  const maxValue = createMemo(() => Math.max(...data().map(d => d.value)));

  onMount(async () => {
    const cached = readCachedData();
    if (cached) {
      setData(cached.data);
      setTotalCommits(cached.total);
      setLoading(false);
      return;
    }

    try {
      let response = await fetch('https://omg-api.latham.cloud/api/github-stats');

      if (!response.ok) {
        reportClientWarning('Proxy failed, falling back to direct GitHub API');
        response = await fetch('https://api.github.com/repos/PyRo1121/omg/stats/commit_activity', {
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
      }

      if (response.status === 202) {
        setError('GitHub is computing statistics. Refresh in 60 seconds.');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const parsed = parseGitHubActivity(await response.json());
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      if ('computing' in parsed.value) {
        setError(parsed.value.message || 'GitHub is computing statistics');
        setLoading(false);
        return;
      }

      const weeks = parsed.value;

      if (weeks.length === 0) {
        throw new Error('Invalid response');
      }

      const finalData = weeks
        .filter(week => week.total > 0)
        .map(week => ({
          label: formatWeekLabel(week.week),
          value: week.total,
        }));
      const finalTotal = finalData.reduce((sum, week) => sum + week.value, 0);

      setData(finalData);
      setTotalCommits(finalTotal);
      writeCachedData(finalData, finalTotal);
    } catch (cause: unknown) {
      reportClientError('GitHub API error:', cause);
      setError(cause instanceof Error ? cause.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  });

  return (
    <div class="mb-8 rounded-2xl border border-white/5 bg-slate-900/50 p-6">
      <div class="mb-4 flex items-center justify-between">
        <a
          href="https://github.com/PyRo1121/omg"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-2 transition-opacity hover:opacity-90"
        >
          <GitHubIcon class="h-5 w-5 text-slate-400" />
          <span class="text-sm font-medium text-slate-300">Weekly Commits</span>
        </a>
        <Show when={!loading() && totalCommits() > 0}>
          <span class="text-xs font-medium text-indigo-400">
            {totalCommits().toLocaleString()} commits
          </span>
        </Show>
      </div>

      <Show when={loading()}>
        <div class="flex h-32 items-center justify-center">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      </Show>

      <Show when={!loading() && data().length > 0}>
        <div class="flex items-end gap-3" style={{ height: '140px' }}>
          <For each={data()}>
            {item => {
              const barHeight = Math.max((item.value / maxValue()) * 120, 8);
              return (
                <div class="group relative flex flex-1 flex-col items-center gap-2">
                  <div
                    class="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all duration-500 group-hover:brightness-125"
                    style={{
                      height: `${barHeight}px`,
                      'box-shadow': '0 0 20px -5px rgba(99,102,241,0.4)',
                    }}
                  />
                  <span class="text-[10px] font-medium text-slate-500 transition-colors group-hover:text-slate-300">
                    {item.label}
                  </span>
                  <div class="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 scale-95 rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-xs whitespace-nowrap text-white opacity-0 shadow-xl backdrop-blur-md transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
                    <span class="font-bold text-indigo-400">{item.value}</span> commits
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={!loading() && data().length === 0 && !error()}>
        <div class="flex h-32 items-center justify-center text-sm text-slate-500">
          No commit data available
        </div>
      </Show>

      <Show when={error()}>
        <div class="flex h-32 items-center justify-center text-sm text-slate-500">{error()}</div>
      </Show>
    </div>
  );
};

export default GitHubActivity;
