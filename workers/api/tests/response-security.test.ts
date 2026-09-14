import '../src/cloudflare-test.d.ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env } from '../src/api';
import { SITE_ORIGIN } from '../../../shared/public-site';
import { fetchWorker } from './test-utils';

const STATS_URL = 'https://omg-api.latham.cloud/api/github-stats';
const STATS = [{ days: [1, 0, 0, 0, 0, 0, 0], total: 1, week: 1755990000 }];
const PUBLIC_CACHE = 'public, max-age=120, stale-while-revalidate=3600';
const SECRET = 'firehose-test-secret';

function expectBaseline(response: Response): void {
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('Strict-Transport-Security')).toBe(
    'max-age=31536000; includeSubDomains; preload'
  );
  expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-site');
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SITE_ORIGIN);
}

function firehoseRequest(secret: string | null, ip: string | null = null): Request {
  const headers = new Headers({ 'X-Internal-Call': 'service-binding' });
  if (secret !== null) headers.set('X-Admin-Secret', secret);
  if (ip !== null) headers.set('CF-Connecting-IP', ip);
  return new Request('https://omg-api.latham.cloud/api/internal/admin/firehose?limit=1', {
    headers,
  });
}

describe('internal firehose pre-secret throttling', () => {
  const prepare = env.DB.prepare;
  let queries = 0;

  beforeEach(() => {
    queries = 0;
    env.DB.prepare = function (sql: string) {
      queries += 1;
      return prepare.call(env.DB, sql);
    };
  });

  afterEach(() => {
    env.DB.prepare = prepare;
  });

  it.each([SECRET, 'wrong-secret', null])(
    'throttles secret %s before auth or data work',
    async secret => {
      let secretReads = 0;
      const environment: Env = {
        ...env,
        API_RATE_LIMITER: { limit: async () => ({ success: false }) },
        get SVELTE_BFF_SECRET() {
          secretReads += 1;
          return SECRET;
        },
      };
      const response = await fetchWorker(firehoseRequest(secret), environment);
      expect(response.status).toBe(429);
      expect(secretReads).toBe(0);
      expect(queries).toBe(0);
      expectBaseline(response);
    }
  );

  it.each(['missing', 'throwing'])('fails closed when limiter is %s', async mode => {
    const response = await fetchWorker(firehoseRequest(SECRET), {
      ...env,
      SVELTE_BFF_SECRET: SECRET,
      API_RATE_LIMITER:
        mode === 'missing'
          ? undefined
          : {
              limit: async () => {
                throw new Error('test limiter unavailable');
              },
            },
    });
    expect(response.status).toBe(503);
    expect(queries).toBe(0);
  });

  it('scopes guesses by source, preserves binding polling, and still rejects wrong secrets', async () => {
    const keys: string[] = [];
    const environment: Env = {
      ...env,
      SVELTE_BFF_SECRET: SECRET,
      API_RATE_LIMITER: {
        limit: async ({ key }) => {
          keys.push(key);
          return { success: true };
        },
      },
    };
    for (const secret of ['wrong-one', 'wrong-two', null]) {
      expect((await fetchWorker(firehoseRequest(secret, '192.0.2.1'), environment)).status).toBe(
        404
      );
    }
    expect(queries).toBe(0);
    const accepted = await fetchWorker(firehoseRequest(SECRET), environment);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ events: [], count: 0 });
    expect(queries).toBe(1);
    expect(keys).toEqual([
      'internal_firehose:192.0.2.1',
      'internal_firehose:192.0.2.1',
      'internal_firehose:192.0.2.1',
      'internal_firehose:unknown',
    ]);
    const unmarked = firehoseRequest(SECRET);
    unmarked.headers.delete('X-Internal-Call');
    expect((await fetchWorker(unmarked, environment)).status).toBe(404);
    expect(keys).toHaveLength(4);
    expect(queries).toBe(1);
  });
});

describe('baseline headers preserve raw response contracts', () => {
  const originalFetch = globalThis.fetch;
  const prepare = env.DB.prepare;

  beforeEach(async () => {
    await caches.default.delete(new Request(STATS_URL));
    // Never send requests to the real upstream from these regression tests.
    globalThis.fetch = async () => new Response(JSON.stringify(STATS), { status: 200 });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    env.DB.prepare = prepare;
    await caches.default.delete(new Request(STATS_URL));
  });

  it.each(['/health', '/missing-route'])('retains the private JSON policy for %s', async path => {
    const response = await fetchWorker(new Request(`https://omg-api.latham.cloud${path}`));
    expectBaseline(response);
    expect(response.status).toBe(path === '/health' ? 200 : 404);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-store, no-cache, must-revalidate'
    );
  });

  it('preserves the empty OPTIONS response and preflight headers', async () => {
    const response = await fetchWorker(new Request(STATS_URL, { method: 'OPTIONS' }));
    expectBaseline(response);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Content-Type')).toBeNull();
    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type, Authorization'
    );
  });

  it.each([false, true])(
    'preserves badge JSON and caching when unavailable=%s',
    async unavailable => {
      if (unavailable) {
        env.DB.prepare = () => {
          throw new Error('test database unavailable');
        };
      }
      const response = await fetchWorker(
        new Request('https://omg-api.latham.cloud/api/badge/installs')
      );
      expectBaseline(response);
      expect(response.status).toBe(unavailable ? 503 : 200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe(
        unavailable ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300'
      );
      expect(response.headers.get('CDN-Cache-Control')).toBeNull();
      expect(await response.json()).toMatchObject({ schemaVersion: 1, label: 'installs' });
    }
  );

  it.each(['MISS', 'HIT', 'STALE'])(
    'preserves GitHub %s body, CORS and cache lifetimes',
    async state => {
      if (state !== 'MISS') {
        await caches.default.put(
          new Request(STATS_URL),
          new Response(JSON.stringify(STATS), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600',
              'X-OMG-Stored-At': String(Date.now() - (state === 'STALE' ? 180_000 : 0)),
              'Access-Control-Allow-Origin': 'https://legacy.example',
            },
          })
        );
      }
      const response = await fetchWorker(new Request(STATS_URL));
      expectBaseline(response);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe(PUBLIC_CACHE);
      expect(response.headers.get('CDN-Cache-Control')).toBeNull();
      expect(response.headers.get('X-Cache')).toBe(state);
      expect(response.headers.get('X-OMG-Stored-At')).toBeNull();
      expect(await response.json()).toEqual(STATS);
      const cached = await caches.default.match(new Request(STATS_URL));
      expect(cached?.headers.get('Cache-Control')).toBe('public, max-age=3600');
    }
  );

  it.each([202, 500])('preserves GitHub upstream %s status semantics', async upstreamStatus => {
    globalThis.fetch = async () => new Response('{}', { status: upstreamStatus });
    const response = await fetchWorker(new Request(STATS_URL));
    expectBaseline(response);
    expect(response.status).toBe(upstreamStatus === 202 ? 202 : 502);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Retry-After')).toBe(upstreamStatus === 202 ? '60' : null);
    expect(response.headers.get('Cache-Control')).toBe(
      upstreamStatus === 202 ? 'no-cache' : 'private, no-store, no-cache, must-revalidate'
    );
    expect(await caches.default.match(new Request(STATS_URL))).toBeUndefined();
  });
});
