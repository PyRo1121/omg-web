/**
 * Privacy-first analytics client for OMG website
 *
 * Design principles:
 * - No cookies, localStorage, or sessionStorage
 * - No fingerprinting (no canvas, font, or device fingerprints)
 * - No PII collection
 * - GDPR compliant by default
 * - Uses Beacon API for reliable data sending
 * - Geo derived from edge/CDN headers on server
 */

const ANALYTICS_ENDPOINT = 'https://api.pyro1121.com/api/site/analytics/events';
const BATCH_INTERVAL_MS = 3000;
const MAX_BATCH_SIZE = 20;

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

interface AnalyticsEvent {
  type: EventType;
  name: string;
  timestamp: number;
  page_path: string;
  page_url: string;
  properties: AnalyticsProperties;
}

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
let maxScrollDepth = 0;
let isInitialized = false;
let vitalsReported = false;
let clsValue = 0;
let clsEntries: PerformanceEntry[] = [];

/**
 * Generate a simple page view ID for session-less correlation
 * This is NOT a session ID - it's ephemeral and per-page
 */
function generatePageViewId(): string {
  return `pv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    page_path: globalThis.window.location.pathname,
    page_url: globalThis.window.location.href.split('?')[0], // Strip query params for privacy
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
function getUtmParams(): UtmParams {
  if (!('window' in globalThis)) return {};
  const params = new URLSearchParams(globalThis.window.location.search);
  const utm: UtmParams = {};
  const values = {
    source: params.get('utm_source'),
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
    term: params.get('utm_term'),
  };
  if (values.source) utm.source = values.source;
  if (values.medium) utm.medium = values.medium;
  if (values.campaign) utm.campaign = values.campaign;
  if (values.content) utm.content = values.content;
  if (values.term) utm.term = values.term;
  return utm;
}

/**
 * Queue an analytics event
 */
function queueEvent(type: EventType, name: string, properties: AnalyticsProperties = {}): void {
  const context = getPageContext();
  const event: AnalyticsEvent = {
    type,
    name,
    timestamp: Date.now(),
    page_path: context.page_path,
    page_url: context.page_url,
    properties: {
      ...properties,
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
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushEvents();
  }, BATCH_INTERVAL_MS);
}

/**
 * Flush events using Beacon API for reliability
 */
function flushEvents(): void {
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];

  const payload = JSON.stringify({ events });

  // Prefer Beacon API for reliability (works even on page unload)
  if (navigator.sendBeacon) {
    const success = navigator.sendBeacon(ANALYTICS_ENDPOINT, payload);
    if (!success) {
      // Beacon failed, try fetch as fallback
      sendWithFetch(payload, events);
    }
  } else {
    sendWithFetch(payload, events);
  }
}

/**
 * Fallback to fetch if Beacon API unavailable
 */
async function sendWithFetch(payload: string, events: AnalyticsEvent[]): Promise<void> {
  try {
    const response = await fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    });
    if (!response.ok) {
      // Re-queue events on failure
      eventQueue = [...events, ...eventQueue];
    }
  } catch {
    // Re-queue events on error
    eventQueue = [...events, ...eventQueue];
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Track a page view
 */
export function trackPageView(): void {
  if (!('window' in globalThis)) return;

  currentPageViewId = generatePageViewId();
  pageLoadTime = Date.now();
  maxScrollDepth = 0;
  vitalsReported = false;
  clsValue = 0;
  clsEntries = [];

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
export function trackScrollDepth(depth: number): void {
  // Only track at specific thresholds: 25%, 50%, 75%, 90%, 100%
  const thresholds = [25, 50, 75, 90, 100];
  const roundedDepth = thresholds.find(t => depth >= t && maxScrollDepth < t);

  if (roundedDepth && roundedDepth > maxScrollDepth) {
    maxScrollDepth = roundedDepth;
    queueEvent('scroll_depth', 'scroll', {
      depth: roundedDepth,
    });
  }
}

/**
 * Track time spent on page (call on page unload)
 */
export function trackTimeOnPage(): void {
  if (pageLoadTime === 0) return;

  const timeSpentMs = Date.now() - pageLoadTime;
  const timeSpentSec = Math.round(timeSpentMs / 1000);

  // Only track if user spent meaningful time (> 5 seconds)
  if (timeSpentSec >= 5) {
    queueEvent('time_on_page', 'time_spent', {
      duration_seconds: timeSpentSec,
      max_scroll_depth: maxScrollDepth,
    });
  }
}

/**
 * Track CTA clicks
 */
export function trackCtaClick(ctaType: CtaType, ctaLabel?: string): void {
  queueEvent('cta_click', 'cta_interaction', {
    cta_type: ctaType,
    cta_label: ctaLabel || ctaType,
  });
}

/**
 * Track custom engagement events
 */
export function trackEngagement(action: string, properties?: AnalyticsProperties): void {
  queueEvent('engagement', action, properties || {});
}

/**
 * Report Core Web Vitals
 */
function getDeviceType(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function getMetricRating(
  value: number,
  goodThreshold: number,
  needsImprovementThreshold: number
): 'good' | 'needs-improvement' | 'poor' {
  if (value <= goodThreshold) return 'good';
  if (value <= needsImprovementThreshold) return 'needs-improvement';
  return 'poor';
}

export function reportWebVitals(metrics: WebVitalsMetrics): void {
  if (vitalsReported) return;
  vitalsReported = true;

  const vitalsWithRating: AnalyticsProperties = {};

  // Add values and ratings for each metric
  if (metrics.lcp !== undefined) {
    vitalsWithRating.lcp = metrics.lcp;
    vitalsWithRating.lcp_rating = getMetricRating(metrics.lcp, 2500, 4000);
  }
  if (metrics.inp !== undefined) {
    vitalsWithRating.inp = metrics.inp;
    vitalsWithRating.inp_rating = getMetricRating(metrics.inp, 200, 500);
  }
  if (metrics.cls !== undefined) {
    vitalsWithRating.cls = metrics.cls;
    vitalsWithRating.cls_rating = getMetricRating(metrics.cls, 0.1, 0.25);
  }
  if (metrics.ttfb !== undefined) {
    vitalsWithRating.ttfb = metrics.ttfb;
    vitalsWithRating.ttfb_rating = getMetricRating(metrics.ttfb, 800, 1800);
  }
  if (metrics.fcp !== undefined) {
    vitalsWithRating.fcp = metrics.fcp;
    vitalsWithRating.fcp_rating = getMetricRating(metrics.fcp, 1800, 3000);
  }

  queueEvent('web_vitals', 'core_web_vitals', vitalsWithRating);
}

/**
 * Initialize scroll depth tracking
 */
function initScrollTracking(): void {
  let ticking = false;

  const handleScroll = () => {
    if (ticking) return;
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

/**
 * Initialize Web Vitals collection using PerformanceObserver
 */
function initWebVitalsCollection(): void {
  if (!('PerformanceObserver' in window)) return;

  const metrics: WebVitalsMetrics = {};
  let lcpReported = false;

  // LCP Observer
  try {
    const lcpObserver = new PerformanceObserver(list => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        metrics.lcp = lastEntry.startTime;
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // Report LCP on first interaction or visibility change
    const reportLcp = () => {
      if (!lcpReported && metrics.lcp) {
        lcpReported = true;
        lcpObserver.disconnect();
      }
    };
    ['keydown', 'click', 'visibilitychange'].forEach(event => {
      window.addEventListener(event, reportLcp, { once: true, capture: true });
    });
  } catch {
    // LCP observer not supported
  }

  // INP Observer (replaces FID)
  try {
    const inpObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        // SAFETY: PerformanceObserver entries observed with type "event" are PerformanceEventTiming per the Web Performance API.
        const eventEntry = entry as PerformanceEventTiming;
        const duration = eventEntry.processingEnd - eventEntry.startTime;
        if (!metrics.inp || duration > metrics.inp) {
          metrics.inp = duration;
        }
      }
    });
    inpObserver.observe({ type: 'event', buffered: true });
  } catch {
    // INP observer not supported, try FID as fallback
    try {
      const fidObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          // SAFETY: PerformanceObserver entries observed with type "first-input" are PerformanceEventTiming per the Web Performance API.
          const eventEntry = entry as PerformanceEventTiming;
          metrics.inp = eventEntry.processingStart - eventEntry.startTime;
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    } catch {
      // Neither supported
    }
  }

  // CLS Observer
  try {
    const clsObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        // SAFETY: PerformanceObserver entries observed with type "layout-shift" expose these layout-shift fields.
        const layoutShift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (!layoutShift.hadRecentInput && layoutShift.value) {
          clsValue += layoutShift.value;
          clsEntries.push(entry);
        }
      }
      metrics.cls = clsValue;
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // CLS observer not supported
  }

  // TTFB and FCP from navigation timing
  try {
    const paintObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          metrics.fcp = entry.startTime;
        }
      }
    });
    paintObserver.observe({ type: 'paint', buffered: true });

    // Get TTFB from navigation timing
    // SAFETY: Entries returned for the "navigation" performance entry type are PerformanceNavigationTiming.
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      metrics.ttfb = navEntry.responseStart - navEntry.requestStart;
    }
  } catch {
    // Navigation timing not available
  }

  // Report vitals before page unload
  const reportVitals = () => {
    if (Object.keys(metrics).length > 0) {
      reportWebVitals(metrics);
    }
  };

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      reportVitals();
    }
  });

  window.addEventListener('pagehide', reportVitals);
}

function parseCtaType(value: string): CtaType | undefined {
  switch (value) {
    case 'download':
    case 'signup':
    case 'pricing':
    case 'docs':
    case 'github':
    case 'install':
      return value;
    default:
      return undefined;
  }
}

/**
 * Initialize CTA click tracking
 */
function initCtaTracking(): void {
  document.addEventListener(
    'click',
    e => {
      if (!(e.target instanceof HTMLElement)) return;
      const link = e.target.closest('a, button');
      if (!link) return;

      const href = link.getAttribute('href') || '';
      const dataTrack = link.getAttribute('data-track-cta');

      // Auto-detect CTA type from href or data attribute
      if (dataTrack) {
        const parsedCtaType = parseCtaType(dataTrack);
        if (parsedCtaType) trackCtaClick(parsedCtaType, link.textContent?.trim());
      } else if (href.includes('install') || href.includes('#install')) {
        trackCtaClick('install', link.textContent?.trim());
      } else if (href.includes('signup') || href.includes('login')) {
        trackCtaClick('signup', link.textContent?.trim());
      } else if (href.includes('pricing') || href.includes('#pricing')) {
        trackCtaClick('pricing', link.textContent?.trim());
      } else if (href.includes('/docs')) {
        trackCtaClick('docs', link.textContent?.trim());
      } else if (href.includes('github.com')) {
        trackCtaClick('github', link.textContent?.trim());
      } else if (href.includes('download') || link.classList.contains('download-btn')) {
        trackCtaClick('download', link.textContent?.trim());
      }
    },
    { capture: true }
  );
}

/**
 * Initialize SPA navigation tracking
 */
function initNavigationTracking(): void {
  // Track history changes for SPA navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    // Track time on previous page before navigation
    trackTimeOnPage();
    flushEvents();

    originalPushState.apply(this, args);
    trackPageView();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    // Don't track pageview on replaceState (e.g., query param updates)
  };

  window.addEventListener('popstate', () => {
    trackTimeOnPage();
    flushEvents();
    trackPageView();
  });
}

/**
 * Initialize all analytics tracking
 */
export function initAnalytics(): void {
  if (!('window' in globalThis) || isInitialized) return;
  isInitialized = true;

  // Track initial page view
  trackPageView();

  // Initialize all trackers
  initScrollTracking();
  initWebVitalsCollection();
  initCtaTracking();
  initNavigationTracking();

  // Flush on page unload
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      trackTimeOnPage();
      flushEvents();
    }
  });

  window.addEventListener('pagehide', () => {
    trackTimeOnPage();
    flushEvents();
  });

  // Fallback for beforeunload
  window.addEventListener('beforeunload', () => {
    trackTimeOnPage();
    flushEvents();
  });
}

export default {
  init: initAnalytics,
  trackPageView,
  trackScrollDepth,
  trackTimeOnPage,
  trackCtaClick,
  trackEngagement,
  reportWebVitals,
};
