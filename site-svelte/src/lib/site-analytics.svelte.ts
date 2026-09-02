/**
 * Privacy-first analytics client. No cookies, storage, fingerprinting, or PII;
 * geo is derived from edge headers server-side.
 */

import { browserPrivacySignalEnabled } from '../../../shared/browser-privacy';
import {
  inputDelayMs,
  interactionMs,
  layoutShiftDelta,
  navigationTtfbMs,
} from './site-performance-entry';
const ANALYTICS_ENDPOINT = '/api/analytics/site/';
const BATCH_INTERVAL_MS = 3000;
const MAX_BATCH_SIZE = 20;
const MAX_RETRY_QUEUE_SIZE = 50;

// Event types for analytics
type EventType =
  'pageview' | 'scroll_depth' | 'time_on_page' | 'cta_click' | 'web_vitals' | 'engagement';
type CtaType = 'download' | 'signup' | 'pricing' | 'docs' | 'github' | 'install';

interface PageContext {
  page_path: string;
  page_url: string;
}

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

/** Event envelope matching the Worker's TrackingEventSchema. */
interface AnalyticsEvent {
  event_type: EventType;
  event_name: string;
  session_id: string;
  timestamp: number;
  duration_ms?: number;
  properties: AnalyticsProperties;
}

/** Browser performance metrics accepted by the analytics reporting boundary. */
interface WebVitalsMetrics {
  lcp?: number; // Largest Contentful Paint
  inp?: number; // Interaction to Next Paint (replaces FID)
  cls?: number; // Cumulative Layout Shift
  ttfb?: number; // Time to First Byte
  fcp?: number; // First Contentful Paint
}

// Module state (no persistent storage)
let eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pageLoadTime = 0;
let timeOnPageEmitted = false;

// Random per-page-load session id; no storage is used, by design.
let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId === null) {
    sessionId = `ses_${crypto.randomUUID()}`;
  }
  return sessionId;
}
let maxScrollDepth = 0;
let isInitialized = false;
let vitalsReported = false;
let clsValue = 0;

/**
 * Generate a simple page view ID for session-less correlation
 * This is NOT a session ID - it's ephemeral and per-page
 */
function generatePageViewId(): string {
  return `pv_${crypto.randomUUID()}`;
}

let currentPageViewId = '';

/**
 * Get basic page context without any tracking identifiers
 */
function getPageContext(): PageContext {
  if (!('window' in globalThis)) {
    return { page_path: '', page_url: '' };
  }
  return {
    page_path: globalThis.window.location.pathname.slice(0, 256),
    page_url: globalThis.window.location.href.split('?').at(0) ?? globalThis.window.location.href, // Strip query params for privacy
  };
}

/**
 * Get referrer domain only (not full URL for privacy)
 */
function getReferrerDomain(): string {
  if (!('document' in globalThis) || !globalThis.document.referrer) {
    return 'direct';
  }
  try {
    const url = new URL(globalThis.document.referrer);
    if (url.hostname === globalThis.window.location.hostname) {
      return 'internal';
    }
    return url.hostname;
  } catch {
    return 'direct';
  }
}

/**
 * Get UTM parameters from current URL
 */
function boundedAnalyticsText(value: string): string {
  return value.slice(0, 512);
}

function getUtmParams(): UtmParams {
  if (!('window' in globalThis)) {
    return {};
  }
  const params = new URLSearchParams(globalThis.window.location.search);
  const utm: UtmParams = {};
  const values = {
    source: params.get('utm_source'),
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
    term: params.get('utm_term'),
  };
  if (values.source) {
    utm.source = boundedAnalyticsText(values.source);
  }
  if (values.medium) {
    utm.medium = boundedAnalyticsText(values.medium);
  }
  if (values.campaign) {
    utm.campaign = boundedAnalyticsText(values.campaign);
  }
  if (values.content) {
    utm.content = boundedAnalyticsText(values.content);
  }
  if (values.term) {
    utm.term = boundedAnalyticsText(values.term);
  }
  return utm;
}

/**
 * Queue an analytics event
 */
function queueEvent(type: EventType, name: string, properties: AnalyticsProperties = {}): void {
  if (browserPrivacySignalEnabled(globalThis.navigator)) {
    return;
  }
  const event: AnalyticsEvent = {
    event_type: type,
    event_name: name,
    session_id: getSessionId(),
    timestamp: Date.now(),
    properties: {
      ...properties,
      path: getPageContext().page_path,
      pv_id: currentPageViewId,
    },
  };
  eventQueue.push(event);

  // Auto-flush if batch is full
  if (eventQueue.length >= MAX_BATCH_SIZE) {
    flushEvents();
  } else {
    scheduleFlush();
  }
}

/**
 * Schedule a flush of the event queue
 */
function scheduleFlush(): void {
  if (flushTimer) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushEvents();
  }, BATCH_INTERVAL_MS);
}

/**
 * Flush queued events through a keepalive fetch.
 *
 * A same-origin keepalive fetch retains unload reliability. The Svelte endpoint
 * bounds and decodes the batch before forwarding it over the private Service Binding.
 */
function flushEvents(): void {
  if (browserPrivacySignalEnabled(globalThis.navigator)) {
    eventQueue = [];
    return;
  }
  if (eventQueue.length === 0) {
    return;
  }

  const events = [...eventQueue];
  eventQueue = [];
  void sendWithFetch(JSON.stringify({ events }), events);
}

/** Send one queued batch, restoring it if the network boundary rejects it. */
async function sendWithFetch(payload: string, events: AnalyticsEvent[]): Promise<void> {
  try {
    const response = await fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      credentials: 'same-origin',
      keepalive: true,
    });
    if (!response.ok) {
      // Retain a bounded retry window instead of growing memory while offline.
      eventQueue = [...events, ...eventQueue].slice(0, MAX_RETRY_QUEUE_SIZE);
    }
  } catch {
    eventQueue = [...events, ...eventQueue].slice(0, MAX_RETRY_QUEUE_SIZE);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Track a page view
 */
function trackPageView(): void {
  if (!('window' in globalThis)) {
    return;
  }

  currentPageViewId = generatePageViewId();
  pageLoadTime = Date.now();
  maxScrollDepth = 0;
  vitalsReported = false;
  timeOnPageEmitted = false;
  clsValue = 0;

  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  queueEvent('pageview', 'page_view', {
    referrer: getReferrerDomain(),
    utm: getUtmParams(),
    viewport,
    device_type: getDeviceType(viewport.width),
  });
}

/**
 * Track scroll depth (call on scroll events, deduplicated internally)
 */
function trackScrollDepth(depth: number): void {
  const thresholds = [25, 50, 75, 90, 100];
  const roundedDepth = thresholds.find(t => depth >= t && maxScrollDepth < t);

  if (roundedDepth !== undefined) {
    maxScrollDepth = roundedDepth;
    queueEvent('scroll_depth', 'scroll', {
      depth: roundedDepth,
    });
  }
}

/**
 * Track time spent on page. Fires once per pageview; navigation restarts the
 * window so tab hides do not re-emit cumulative duration.
 */
function trackTimeOnPage(): void {
  if (pageLoadTime === 0 || timeOnPageEmitted) {
    return;
  }

  const timeSpentMs = Date.now() - pageLoadTime;
  const timeSpentSec = Math.round(timeSpentMs / 1000);

  if (timeSpentSec >= 5) {
    timeOnPageEmitted = true;
    queueEvent('time_on_page', 'time_spent', {
      duration_seconds: timeSpentSec,
      max_scroll_depth: maxScrollDepth,
    });
  }
}

/**
 * Track CTA clicks
 */
function trackCtaClick(ctaType: CtaType, ctaLabel?: string): void {
  queueEvent('cta_click', 'cta_interaction', {
    cta_type: ctaType,
    cta_label: boundedAnalyticsText(ctaLabel || ctaType),
  });
}

/**
 * Report Core Web Vitals
 */
function getDeviceType(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 768) {
    return 'mobile';
  }
  if (width < 1024) {
    return 'tablet';
  }
  return 'desktop';
}

function getMetricRating(
  value: number,
  goodThreshold: number,
  needsImprovementThreshold: number
): 'good' | 'needs-improvement' | 'poor' {
  if (value <= goodThreshold) {
    return 'good';
  }
  if (value <= needsImprovementThreshold) {
    return 'needs-improvement';
  }
  return 'poor';
}

function reportWebVitals(metrics: WebVitalsMetrics): void {
  if (vitalsReported) {
    return;
  }
  vitalsReported = true;

  const vitalsWithRating: AnalyticsProperties = {};

  // Add values and ratings for each metric
  if (metrics.lcp !== undefined) {
    vitalsWithRating['lcp'] = metrics.lcp;
    vitalsWithRating['lcp_rating'] = getMetricRating(metrics.lcp, 2500, 4000);
  }
  if (metrics.inp !== undefined) {
    vitalsWithRating['inp'] = metrics.inp;
    vitalsWithRating['inp_rating'] = getMetricRating(metrics.inp, 200, 500);
  }
  if (metrics.cls !== undefined) {
    vitalsWithRating['cls'] = metrics.cls;
    vitalsWithRating['cls_rating'] = getMetricRating(metrics.cls, 0.1, 0.25);
  }
  if (metrics.ttfb !== undefined) {
    vitalsWithRating['ttfb'] = metrics.ttfb;
    vitalsWithRating['ttfb_rating'] = getMetricRating(metrics.ttfb, 800, 1800);
  }
  if (metrics.fcp !== undefined) {
    vitalsWithRating['fcp'] = metrics.fcp;
    vitalsWithRating['fcp_rating'] = getMetricRating(metrics.fcp, 1800, 3000);
  }

  queueEvent('web_vitals', 'core_web_vitals', vitalsWithRating);
}

/**
 * Initialize scroll depth tracking
 */
function initScrollTracking(): void {
  let ticking = false;

  const handleScroll = () => {
    if (ticking) {
      return;
    }
    ticking = true;

    requestAnimationFrame(() => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) {
        const scrollPercentage = Math.round((window.scrollY / scrollHeight) * 100);
        trackScrollDepth(scrollPercentage);
      }
      ticking = false;
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
}

/** Initialize each independently supported Web Vitals observer. */
function initWebVitalsCollection(): void {
  if (!('PerformanceObserver' in window)) {
    return;
  }
  const metrics: WebVitalsMetrics = {};
  observeLargestContentfulPaint(metrics);
  observeInteractionLatency(metrics);
  observeLayoutShift(metrics);
  observePaintAndNavigation(metrics);
  reportVitalsOnPageExit(metrics);
}

function observeLargestContentfulPaint(metrics: WebVitalsMetrics): void {
  try {
    const observer = new PerformanceObserver(list => {
      const entries = list.getEntries();
      const lastEntry = entries.at(-1);
      if (lastEntry !== undefined) {
        metrics.lcp = lastEntry.startTime;
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
    let reported = false;
    const stopObserving = () => {
      if (!reported && metrics.lcp !== undefined) {
        reported = true;
        observer.disconnect();
      }
    };
    for (const event of ['keydown', 'click', 'visibilitychange']) {
      window.addEventListener(event, stopObserving, { once: true, capture: true });
    }
  } catch {
    // Unsupported observer types are optional browser capabilities.
  }
}

function observeInteractionLatency(metrics: WebVitalsMetrics): void {
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const duration = interactionMs(entry);
        if (duration !== undefined && (metrics.inp === undefined || duration > metrics.inp)) {
          metrics.inp = duration;
        }
      }
    });
    observer.observe({ type: 'event', buffered: true });
  } catch {
    observeFirstInputDelay(metrics);
  }
}

function observeFirstInputDelay(metrics: WebVitalsMetrics): void {
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const delay = inputDelayMs(entry);
        if (delay !== undefined) {
          metrics.inp = delay;
        }
      }
    });
    observer.observe({ type: 'first-input', buffered: true });
  } catch {
    // Unsupported observer types are optional browser capabilities.
  }
}

function observeLayoutShift(metrics: WebVitalsMetrics): void {
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const delta = layoutShiftDelta(entry);
        if (delta !== undefined) {
          clsValue += delta;
        }
      }
      metrics.cls = clsValue;
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Unsupported observer types are optional browser capabilities.
  }
}

function observePaintAndNavigation(metrics: WebVitalsMetrics): void {
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          metrics.fcp = entry.startTime;
        }
      }
    });
    observer.observe({ type: 'paint', buffered: true });
    const ttfb = navigationTtfbMs(performance.getEntriesByType('navigation'));
    if (ttfb !== undefined) {
      metrics.ttfb = ttfb;
    }
  } catch {
    // Navigation timing is an optional browser capability.
  }
}

type PageExitCallback = () => void;

const pageExitCallbacks: PageExitCallback[] = [];
let pageExitListenersAttached = false;

function runPageExitCallbacks(): void {
  for (const callback of pageExitCallbacks) {
    callback();
  }
}

/**
 * Register work to run when the page session may be ending. All page-exit
 * consumers share one set of listeners (visibilitychange-hidden, pagehide,
 * beforeunload) instead of each subsystem attaching its own.
 */
function onPageExit(callback: PageExitCallback): void {
  if (!('window' in globalThis)) {
    return;
  }
  pageExitCallbacks.push(callback);
  if (pageExitListenersAttached) {
    return;
  }
  pageExitListenersAttached = true;
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      runPageExitCallbacks();
    }
  });
  window.addEventListener('pagehide', runPageExitCallbacks);
  window.addEventListener('beforeunload', runPageExitCallbacks);
}

/** Initialize delegated CTA click tracking. */
function initCtaTracking(): void {
  document.addEventListener(
    'click',
    event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const link = target.closest('a, button');
      if (link === null) {
        return;
      }
      const ctaType = ctaTypeForLink(link);
      if (ctaType !== undefined) {
        trackCtaClick(ctaType, link.textContent?.trim());
      }
    },
    { capture: true }
  );
}

function ctaTypeForLink(link: Element): CtaType | undefined {
  const href = link.getAttribute('href') || '';
  if (href.startsWith('/#install')) return 'install';
  if (href.startsWith('/login/')) return 'signup';
  if (href.startsWith('/docs')) return 'docs';
  if (href.startsWith('https://github.com/')) return 'github';
  return undefined;
}

/** Record one SvelteKit navigation without patching browser history APIs. */
export function trackAnalyticsNavigation(): void {
  trackTimeOnPage();
  flushEvents();
  trackPageView();
}

/** Report collected vitals once the page exits (idempotent via reportWebVitals). */
function reportVitalsOnPageExit(metrics: WebVitalsMetrics): void {
  onPageExit(() => {
    if (Object.keys(metrics).length > 0) {
      reportWebVitals(metrics);
    }
  });
}

/**
 * Initialize all analytics tracking
 */
export function initAnalytics(): void {
  if (!('window' in globalThis) || isInitialized) {
    return;
  }
  isInitialized = true;
  if (browserPrivacySignalEnabled(globalThis.navigator)) {
    return;
  }

  // Initialize all trackers
  initScrollTracking();
  initWebVitalsCollection();
  initCtaTracking();

  // Flush queued events on page exit (shared listeners via onPageExit)
  onPageExit(() => {
    trackTimeOnPage();
    flushEvents();
  });
}
