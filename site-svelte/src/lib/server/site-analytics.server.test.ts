import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { forwardSiteAnalytics, SiteAnalyticsRejected } from './site-analytics.server';

class AnalyticsServiceStub {
  request: Request | null = null;

  async fetch(outbound: Request): Promise<Response> {
    this.request = outbound;
    return Response.json({ success: true, processed: 1 });
  }
}

function request(body: string | ArrayBuffer, contentType = 'application/json'): Request {
  return new Request('https://omg.latham.cloud/api/analytics/site/', {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'User-Agent': 'Test Browser',
      'CF-Connecting-IP': '192.0.2.10',
      'CF-IPCountry': 'US',
    },
    body,
  });
}

function failureOf(exit: Exit.Exit<number, SiteAnalyticsRejected>): SiteAnalyticsRejected | null {
  return Exit.isSuccess(exit) ? null : Option.getOrNull(Cause.findErrorOption(exit.cause));
}

describe('site analytics forwarding', () => {
  it('decodes the browser batch and forwards only selected edge context', async () => {
    const service = new AnalyticsServiceStub();
    const processed = await Effect.runPromise(
      forwardSiteAnalytics(
        request(
          JSON.stringify({
            events: [
              {
                event_type: 'pageview',
                event_name: 'page_view',
                session_id: 'ses_test',
                timestamp: 1_788_086_400_000,
                properties: {
                  path: '/',
                  pv_id: 'pv_test',
                  referrer: 'https://github.com/',
                  utm: {},
                  viewport: { width: 1440, height: 900 },
                  device_type: 'desktop',
                },
              },
            ],
          })
        ),
        service
      )
    );

    expect(processed).toBe(1);
    expect(service.request).not.toBeNull();
    expect(service.request?.url).toBe('https://omg-saas.internal/api/site/analytics/track');
    expect(service.request?.headers.get('User-Agent')).toBe('Test Browser');
    expect(service.request?.headers.get('CF-IPCountry')).toBe('US');
    expect(service.request?.headers.has('Cookie')).toBe(false);
    expect(service.request?.headers.has('Authorization')).toBe(false);
  });

  it('rejects malformed UTF-8 before the Service Binding', async () => {
    const service = new AnalyticsServiceStub();
    const prefix = new TextEncoder().encode('{"events":[],"padding":"');
    const suffix = new TextEncoder().encode('"}');
    const buffer = new ArrayBuffer(prefix.byteLength + 1 + suffix.byteLength);
    const body = new Uint8Array(buffer);
    body.set(prefix);
    body[prefix.byteLength] = 0xff;
    body.set(suffix, prefix.byteLength + 1);

    const exit = await Effect.runPromiseExit(forwardSiteAnalytics(request(buffer), service));

    expect(failureOf(exit)?.status).toBe(400);
    expect(service.request).toBeNull();
  });

  it('rejects malformed and oversized browser input before the Service Binding', async () => {
    const service = new AnalyticsServiceStub();
    const malformed = await Effect.runPromiseExit(forwardSiteAnalytics(request('{'), service));
    const oversized = await Effect.runPromiseExit(
      forwardSiteAnalytics(
        request(JSON.stringify({ events: [], padding: 'x'.repeat(70_000) })),
        service
      )
    );

    expect(failureOf(malformed)?.status).toBe(400);
    expect(failureOf(oversized)?.status).toBe(413);
    expect(service.request).toBeNull();
  });
});
