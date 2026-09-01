import { RefreshCw, Search } from 'lucide-solid';
import type { Component } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { CommandHealth, FirehoseEvent, GeoDistribution } from './types';

interface RealTimeCommandCenterProps {
  events: FirehoseEvent[];
  geoDistribution: GeoDistribution[];
  commandHealth: CommandHealth;
  isLive?: boolean;
  onRefresh?: () => void;
}

const EVENT_LABELS = {
  command: 'Command',
  install: 'Install',
  search: 'Search',
  runtime_switch: 'Runtime',
  error: 'Error',
} as const satisfies Record<FirehoseEvent['event_type'], string>;

const formatTimestamp = (timestamp: string | undefined): string => {
  if (timestamp === undefined) {
    return 'Unknown';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

const formatDuration = (milliseconds: number | undefined): string => {
  if (milliseconds === undefined) {
    return '—';
  }
  if (milliseconds < 1) {
    return '<1 ms';
  }
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)} s`;
};

export const RealTimeCommandCenter: Component<RealTimeCommandCenterProps> = props => {
  const [eventType, setEventType] = createSignal<'all' | FirehoseEvent['event_type']>('all');
  const [query, setQuery] = createSignal('');

  const filteredEvents = createMemo(() => {
    const normalizedQuery = query().trim().toLowerCase();
    return props.events
      .filter(event => eventType() === 'all' || event.event_type === eventType())
      .filter(
        event =>
          normalizedQuery.length === 0 ||
          event.event_name.toLowerCase().includes(normalizedQuery) ||
          event.hostname.toLowerCase().includes(normalizedQuery) ||
          event.platform.toLowerCase().includes(normalizedQuery)
      )
      .slice(0, 100);
  });

  const totalNodes = createMemo(() =>
    props.geoDistribution.reduce((total, location) => total + location.count, 0)
  );
  const setEventFilter = (value: string): void => {
    if (
      value === 'all' ||
      value === 'command' ||
      value === 'install' ||
      value === 'search' ||
      value === 'runtime_switch' ||
      value === 'error'
    ) {
      setEventType(value);
    }
  };

  return (
    <section
      class="border border-[var(--ink)] bg-[var(--paper-raised)]"
      aria-labelledby="stream-title"
    >
      <header class="grid gap-5 border-b border-[var(--ink)] p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div class="flex items-center gap-3">
            <span class={`h-2 w-2 ${props.isLive ? 'bg-emerald-700' : 'bg-amber-700'}`} />
            <p class="manifest-index">{props.isLive ? 'LIVE FEED' : 'FEED PAUSED'}</p>
          </div>
          <h2 id="stream-title" class="mt-2 text-2xl font-black tracking-[-0.04em] uppercase">
            Command activity
          </h2>
        </div>
        <div class="grid gap-3 sm:grid-cols-[14rem_10rem_auto]">
          <label>
            <span class="sr-only">Filter events</span>
            <span class="relative block">
              <Search
                size={14}
                strokeWidth={1.5}
                class="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]"
              />
              <input
                type="search"
                value={query()}
                onInput={event => setQuery(event.currentTarget.value)}
                placeholder="Name, host, platform"
                class="w-full border border-[var(--ink)] bg-[var(--paper)] py-2.5 pr-3 pl-9 font-mono text-xs placeholder:text-[var(--ink-muted)]"
              />
            </span>
          </label>
          <label>
            <span class="sr-only">Event type</span>
            <select
              value={eventType()}
              onChange={event => setEventFilter(event.currentTarget.value)}
              class="w-full border border-[var(--ink)] bg-[var(--paper)] px-3 py-2.5 font-mono text-xs"
            >
              <option value="all">All events</option>
              <option value="command">Commands</option>
              <option value="install">Installs</option>
              <option value="search">Searches</option>
              <option value="runtime_switch">Runtime</option>
              <option value="error">Errors</option>
            </select>
          </label>
          <button
            type="button"
            class="manifest-button min-h-0 px-3 py-2.5"
            onClick={() => props.onRefresh?.()}
            aria-label="Refresh command activity"
          >
            <RefreshCw size={14} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <div class="grid xl:grid-cols-[1.7fr_1fr]">
        <div class="overflow-x-auto border-b border-[var(--ink)] xl:border-r xl:border-b-0">
          <table class="w-full min-w-[48rem] border-collapse text-left font-mono text-xs">
            <caption class="sr-only">Latest CLI telemetry events</caption>
            <thead>
              <tr class="border-b border-[var(--ink)] text-[10px] tracking-[0.08em] text-[var(--ink-muted)] uppercase">
                <th class="p-4">Time</th>
                <th class="p-4">Type</th>
                <th class="p-4">Event</th>
                <th class="p-4">Host</th>
                <th class="p-4">Platform</th>
                <th class="p-4 text-right">Duration</th>
                <th class="p-4 text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              <For each={filteredEvents()}>
                {event => (
                  <tr class="border-b border-[var(--rule)] last:border-b-0 hover:bg-[var(--paper-muted)]">
                    <td class="p-4 text-[var(--ink-muted)]">
                      <Show when={event.timestamp} fallback="Unknown">
                        {timestamp => (
                          <time dateTime={timestamp()}>{formatTimestamp(timestamp())}</time>
                        )}
                      </Show>
                    </td>
                    <td
                      class={`p-4 font-semibold uppercase ${event.event_type === 'error' ? 'text-red-700' : 'text-[var(--signal)]'}`}
                    >
                      {EVENT_LABELS[event.event_type]}
                    </td>
                    <td class="max-w-64 truncate p-4">{event.event_name}</td>
                    <td class="p-4">{event.hostname || event.machine_id.slice(0, 8)}</td>
                    <td class="p-4">{event.platform}</td>
                    <td class="p-4 text-right">{formatDuration(event.duration_ms)}</td>
                    <td
                      class={`p-4 text-right font-semibold ${
                        event.success === true
                          ? 'text-emerald-700'
                          : event.success === false
                            ? 'text-red-700'
                            : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      {event.success === true
                        ? 'OK'
                        : event.success === false
                          ? 'Failed'
                          : 'Unknown'}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={filteredEvents().length === 0}>
            <div class="grid min-h-56 place-items-center text-center">
              <div>
                <p class="font-medium">No matching events</p>
                <p class="mt-1 font-mono text-xs text-[var(--ink-muted)]">
                  Change the query or event type.
                </p>
              </div>
            </div>
          </Show>
        </div>

        <aside>
          <section class="border-b border-[var(--ink)] p-5" aria-labelledby="health-title">
            <h3 id="health-title" class="manifest-label text-[var(--ink-muted)]">
              Command health
            </h3>
            <dl class="mt-5 grid grid-cols-2 border border-[var(--rule)]">
              <div class="border-r border-[var(--rule)] p-4">
                <dt class="manifest-label text-[var(--ink-muted)]">Success</dt>
                <dd class="m-0 mt-2 font-mono text-3xl text-emerald-700">
                  {props.commandHealth.success === null
                    ? 'No data'
                    : `${props.commandHealth.success.toFixed(1)}%`}
                </dd>
              </div>
              <div class="p-4">
                <dt class="manifest-label text-[var(--ink-muted)]">Failure</dt>
                <dd class="m-0 mt-2 font-mono text-3xl text-red-700">
                  {props.commandHealth.failure === null
                    ? 'No data'
                    : `${props.commandHealth.failure.toFixed(1)}%`}
                </dd>
              </div>
            </dl>
          </section>

          <section class="p-5" aria-labelledby="geo-title">
            <div class="flex justify-between gap-4">
              <h3 id="geo-title" class="manifest-label text-[var(--ink-muted)]">
                Active geography
              </h3>
              <span class="font-mono text-xs">{totalNodes().toLocaleString()} nodes</span>
            </div>
            <div class="mt-5 divide-y divide-[var(--rule)] border-y border-[var(--rule)] font-mono text-xs">
              <For
                each={props.geoDistribution.slice(0, 8)}
                fallback={<p class="py-4 text-[var(--ink-muted)]">No location data</p>}
              >
                {location => (
                  <div class="grid grid-cols-[1fr_auto_auto] gap-4 py-3">
                    <span>{location.country}</span>
                    <span>{location.count.toLocaleString()}</span>
                    <span class="w-14 text-right text-[var(--ink-muted)]">
                      {location.percentage.toFixed(1)}%
                    </span>
                  </div>
                )}
              </For>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
};
