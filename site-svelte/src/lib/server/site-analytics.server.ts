import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { BoundedBodyTooLarge, BoundedBodyUnavailable, readBoundedBody } from '../bounded-body';
const ShortText = Schema.String.check(Schema.isMaxLength(512));
const EventName = Schema.String.check(Schema.isMaxLength(128));
const SessionId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64));
const EpochMs = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 9_999_999_999_999 })
);
const Metric = Schema.Number.check(Schema.makeFilter(Number.isFinite));
const Rating = Schema.Literals(['good', 'needs-improvement', 'poor']);
const CommonProperties = {
  path: Schema.String.check(Schema.isMaxLength(256)),
  pv_id: Schema.String.check(Schema.isMaxLength(64)),
};
const CommonEvent = {
  event_name: EventName,
  session_id: SessionId,
  timestamp: EpochMs,
};
const TrackingEventSchema = Schema.Union([
  Schema.Struct({
    ...CommonEvent,
    event_type: Schema.Literal('pageview'),
    properties: Schema.Struct({
      ...CommonProperties,
      referrer: ShortText,
      utm: Schema.Struct({
        source: Schema.optional(ShortText),
        medium: Schema.optional(ShortText),
        campaign: Schema.optional(ShortText),
        content: Schema.optional(ShortText),
        term: Schema.optional(ShortText),
      }),
      viewport: Schema.Struct({ width: Metric, height: Metric }),
      device_type: Schema.Literals(['mobile', 'tablet', 'desktop']),
    }),
  }),
  Schema.Struct({
    ...CommonEvent,
    event_type: Schema.Literal('scroll_depth'),
    properties: Schema.Struct({ ...CommonProperties, depth: Metric }),
  }),
  Schema.Struct({
    ...CommonEvent,
    event_type: Schema.Literal('time_on_page'),
    properties: Schema.Struct({
      ...CommonProperties,
      duration_seconds: Metric,
      max_scroll_depth: Metric,
    }),
  }),
  Schema.Struct({
    ...CommonEvent,
    event_type: Schema.Literal('cta_click'),
    properties: Schema.Struct({
      ...CommonProperties,
      cta_type: Schema.Literals(['download', 'signup', 'pricing', 'docs', 'github', 'install']),
      cta_label: ShortText,
    }),
  }),
  Schema.Struct({
    ...CommonEvent,
    event_type: Schema.Literal('web_vitals'),
    properties: Schema.Struct({
      ...CommonProperties,
      lcp: Schema.optional(Metric),
      lcp_rating: Schema.optional(Rating),
      inp: Schema.optional(Metric),
      inp_rating: Schema.optional(Rating),
      cls: Schema.optional(Metric),
      cls_rating: Schema.optional(Rating),
      ttfb: Schema.optional(Metric),
      ttfb_rating: Schema.optional(Rating),
      fcp: Schema.optional(Metric),
      fcp_rating: Schema.optional(Rating),
    }),
  }),
  Schema.Struct({
    ...CommonEvent,
    event_type: Schema.Literal('engagement'),
    properties: Schema.Struct(CommonProperties),
  }),
]);
const TrackingBatchSchema = Schema.Struct({
  events: Schema.Array(TrackingEventSchema).check(Schema.isMaxLength(50)),
});

const REQUEST_LIMIT = 64 * 1024;
const RESPONSE_LIMIT = 4096;
const AnalyticsResponseSchema = Schema.Struct({
  success: Schema.Literal(true),
  processed: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 50 })),
});

export class SiteAnalyticsRejected extends Error {
  readonly _tag = 'SiteAnalyticsRejected';
  constructor(
    readonly status: 400 | 413 | 503,
    override readonly cause?: unknown
  ) {
    super('Site analytics request rejected');
  }
}

async function readBoundedText(
  response: Request | Response,
  limit: number,
  tooLargeStatus: 413 | 503,
  invalidStatus: 400 | 503
): Promise<string> {
  try {
    const buffer = await readBoundedBody(response, limit);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer));
    } catch (cause: unknown) {
      throw new SiteAnalyticsRejected(invalidStatus, cause);
    }
  } catch (cause: unknown) {
    if (cause instanceof BoundedBodyTooLarge) {
      throw new SiteAnalyticsRejected(tooLargeStatus);
    }
    if (cause instanceof BoundedBodyUnavailable) {
      throw new SiteAnalyticsRejected(invalidStatus);
    }
    if (cause instanceof SiteAnalyticsRejected) throw cause;
    throw cause;
  }
}

function forwardedAnalyticsHeaders(request: Request): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const name of ['User-Agent', 'CF-Connecting-IP', 'CF-IPCountry', 'CF-City']) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

/** Validate and forward one bounded first-party analytics batch over the Service Binding. */
export function forwardSiteAnalytics(
  request: Request,
  service: App.Platform['env']['LICENSING_API']
): Effect.Effect<number, SiteAnalyticsRejected> {
  return Effect.tryPromise({
    try: async () => {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
        throw new SiteAnalyticsRejected(400);
      }
      const text = await readBoundedText(request, REQUEST_LIMIT, 413, 400);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (cause: unknown) {
        throw new SiteAnalyticsRejected(400, cause);
      }
      const payload = await Schema.decodeUnknownPromise(TrackingBatchSchema)(json).catch(cause => {
        throw new SiteAnalyticsRejected(400, cause);
      });
      const response = await service.fetch(
        new Request('https://omg-saas.internal/api/site/analytics/track', {
          method: 'POST',
          headers: forwardedAnalyticsHeaders(request),
          body: JSON.stringify(payload),
        })
      );
      if (!response.ok) throw new SiteAnalyticsRejected(503);
      const responseText = await readBoundedText(response, RESPONSE_LIMIT, 503, 503);
      let responseJson: unknown;
      try {
        responseJson = JSON.parse(responseText);
      } catch (cause: unknown) {
        throw new SiteAnalyticsRejected(503, cause);
      }
      const accepted = await Schema.decodeUnknownPromise(AnalyticsResponseSchema)(
        responseJson
      ).catch(cause => {
        throw new SiteAnalyticsRejected(503, cause);
      });
      return accepted.processed;
    },
    catch: cause =>
      cause instanceof SiteAnalyticsRejected ? cause : new SiteAnalyticsRejected(503),
  });
}
