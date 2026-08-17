const API_URL = 'https://api.pyro1121.com/api/site/analytics/track';
const BATCH_INTERVAL = 5000;
const SESSION_TIMEOUT = 30 * 60 * 1000;

let eventQueue: AnalyticsEvent[] = [];
let sessionId: string | null = null;
let lastActivity = Date.now();
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

interface Viewport {
  width: number;
  height: number;
}

type AnalyticsValue = string | number | boolean | null | UtmParams | Viewport;
type AnalyticsProperties = Record<string, AnalyticsValue>;

interface AnalyticsEvent {
  event_type: 'pageview' | 'click' | 'form' | 'error' | 'performance';
  event_name: string;
  properties: AnalyticsProperties;
  timestamp: number;
  session_id: string;
  duration_ms?: number;
}

function generateSessionId(): string {
  return `ses_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
}

function getSessionId(): string {
  const now = Date.now();
  if (!sessionId || now - lastActivity > SESSION_TIMEOUT) {
    sessionId = generateSessionId();
  }
  lastActivity = now;
  return sessionId;
}

function getUtmParams(): UtmParams {
  if (!('window' in globalThis)) {return {};}
  const params = new URLSearchParams(globalThis.window.location.search);
  const utm: UtmParams = {};
  const values = {
    source: params.get('utm_source'),
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
    term: params.get('utm_term'),
  };
  if (values.source) {utm.source = values.source;}
  if (values.medium) {utm.medium = values.medium;}
  if (values.campaign) {utm.campaign = values.campaign;}
  if (values.content) {utm.content = values.content;}
  if (values.term) {utm.term = values.term;}
  return utm;
}

function getReferrer(): string {
  if (!('document' in globalThis)) {return 'direct';}
  const ref = globalThis.document.referrer;
  if (!ref) {return 'direct';}
  try {
    const url = new URL(ref);
    if (url.hostname === globalThis.window.location.hostname) {return 'internal';}
    return url.hostname;
  } catch {
    return 'direct';
  }
}

async function flushEvents(): Promise<void> {
  if (eventQueue.length === 0) {return;}

  const events = [...eventQueue];
  eventQueue = [];

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    });

    if (!response.ok) {
      eventQueue = [...events, ...eventQueue];
    }
  } catch {
    eventQueue = [...events, ...eventQueue];
  }
}

function scheduleFlush(): void {
  if (flushTimeout) {return;}
  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushEvents();
  }, BATCH_INTERVAL);
}

function getPagePath(): string {
  if (!('window' in globalThis)) {return '';}
  return globalThis.window.location.pathname;
}

function queueEvent(event: Omit<AnalyticsEvent, 'timestamp' | 'session_id'>): void {
  eventQueue.push({
    ...event,
    timestamp: Date.now(),
    session_id: getSessionId(),
  });
  scheduleFlush();
}

export function trackPageview(path?: string): void {
  if (!('window' in globalThis)) {return;}

  queueEvent({
    event_type: 'pageview',
    event_name: 'page_view',
    properties: {
      path: path || globalThis.window.location.pathname,
      url: globalThis.window.location.href,
      referrer: getReferrer(),
      utm: getUtmParams(),
      viewport: {
        width: globalThis.window.innerWidth,
        height: globalThis.window.innerHeight,
      },
    },
  });
}

export function trackClick(target: string, metadata?: AnalyticsProperties): void {
  queueEvent({
    event_type: 'click',
    event_name: 'element_click',
    properties: {
      target,
      path: getPagePath(),
      ...metadata,
    },
  });
}

export function trackFormSubmit(formId: string, success: boolean): void {
  queueEvent({
    event_type: 'form',
    event_name: success ? 'form_submit_success' : 'form_submit_error',
    properties: {
      form_id: formId,
      path: getPagePath(),
    },
  });
}

export function trackError(error: string, context?: AnalyticsProperties): void {
  queueEvent({
    event_type: 'error',
    event_name: 'client_error',
    properties: {
      error,
      path: getPagePath(),
      ...context,
    },
  });
}

export function trackPerformance(metrics: {
  lcp?: number;
  fid?: number;
  cls?: number;
  ttfb?: number;
}): void {
  queueEvent({
    event_type: 'performance',
    event_name: 'web_vitals',
    properties: {
      path: getPagePath(),
      ...metrics,
    },
  });
}

export function initAnalytics(): void {
  if (!('window' in globalThis)) {return;}

  trackPageview();

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    trackPageview();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    trackPageview();
  };

  window.addEventListener('popstate', () => trackPageview());

  window.addEventListener('beforeunload', () => {
    if (eventQueue.length > 0 && navigator.sendBeacon) {
      navigator.sendBeacon(API_URL, JSON.stringify({ events: eventQueue }));
    }
  });

  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        const metrics: Record<string, number> = {};

        for (const entry of entries) {
          if (entry.entryType === 'largest-contentful-paint') {
            metrics.lcp = entry.startTime;
          } else if (entry.entryType === 'first-input') {
            // SAFETY: PerformanceObserver entries observed with type "first-input" are PerformanceEventTiming.
            metrics.fid = (entry as PerformanceEventTiming).processingStart - entry.startTime;
          } else if (entry.entryType === 'layout-shift') {
            // SAFETY: PerformanceObserver entries with type "layout-shift" expose these fields.
            const layoutShift = entry as PerformanceEntry & {
              hadRecentInput?: boolean;
              value?: number;
            };
            if (!layoutShift.hadRecentInput) {
              metrics.cls = (metrics.cls || 0) + (layoutShift.value || 0);
            }
          }
        }

        if (Object.keys(metrics).length > 0) {
          trackPerformance(metrics);
        }
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      observer.observe({ type: 'first-input', buffered: true });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // PerformanceObserver not supported
    }
  }
}

export default {
  init: initAnalytics,
  trackPageview,
  trackClick,
  trackFormSubmit,
  trackError,
  trackPerformance,
};
