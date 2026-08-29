import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';

const Count = Schema.Number.check(Schema.makeFilter(value => Number.isFinite(value) && value >= 0));
const Text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const LivePayloadSchema = Schema.Struct({
  events: Schema.Array(
    Schema.Struct({
      eventType: Text,
      eventName: Text,
      timestamp: Text,
      version: Text,
      platform: Text,
      durationMs: Schema.NullOr(Count),
      createdAt: Text,
    })
  ),
  count: Count,
  refreshedAt: Text,
});

export type LiveEvent = Schema.Schema.Type<typeof LivePayloadSchema>['events'][number];
export type LiveFeedState = 'current' | 'refreshing' | 'paused' | 'unavailable';
const POLL_INTERVAL_MS = 5_000;
const EVENT_LIMIT = 100;

function eventKey(event: LiveEvent): string {
  return `${event.timestamp}\u0000${event.createdAt}\u0000${event.eventType}\u0000${event.eventName}\u0000${event.platform}`;
}

/** Browser-side owner for bounded, visibility-aware live-feed polling. */
export class AdminLiveFeed {
  events = $state<Array<LiveEvent>>([]);
  refreshedAt = $state('');
  state = $state<LiveFeedState>('current');
  #timer: ReturnType<typeof setTimeout> | null = null;
  #controller: AbortController | null = null;
  #stopped = true;

  constructor(initial: {
    readonly events: ReadonlyArray<LiveEvent>;
    readonly refreshedAt: string;
  }) {
    this.events = [...initial.events].slice(0, EVENT_LIMIT);
    this.refreshedAt = initial.refreshedAt;
  }

  start(): () => void {
    this.#stopped = false;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.state = 'paused';
        this.#clearTimer();
        this.#controller?.abort();
      } else {
        this.state = 'current';
        this.#schedule(0);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.#schedule(POLL_INTERVAL_MS);
    return () => {
      this.#stopped = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      this.#clearTimer();
      this.#controller?.abort();
    };
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule(delay: number): void {
    this.#clearTimer();
    if (this.#stopped || document.visibilityState === 'hidden') return;
    this.#timer = setTimeout(() => void this.#refresh(), delay);
  }

  async #refresh(): Promise<void> {
    this.state = 'refreshing';
    const controller = new AbortController();
    this.#controller = controller;
    const url = new URL('/admin/live/events/', window.location.origin);
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Live feed request rejected');
      const decoded = await Effect.runPromiseExit(
        Schema.decodeUnknownEffect(LivePayloadSchema)(await response.json())
      );
      if (Exit.isFailure(decoded)) throw new Error('Live feed response invalid');
      const merged = new Map<string, LiveEvent>();
      for (const event of [...decoded.value.events, ...this.events])
        merged.set(eventKey(event), event);
      this.events = Array.from(merged.values())
        .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, EVENT_LIMIT);
      this.refreshedAt = decoded.value.refreshedAt;
      this.state = 'current';
    } catch {
      if (!controller.signal.aborted) this.state = 'unavailable';
    } finally {
      if (this.#controller === controller) this.#controller = null;
      this.#schedule(POLL_INTERVAL_MS);
    }
  }
}
