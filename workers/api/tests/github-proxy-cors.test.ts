import '../src/cloudflare-test.d.ts';
import { describe, it, expect } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

const STATS_URL = 'https://omg-api.latham.cloud/api/github-stats';
const ALLOWED_ORIGIN = 'https://omg.latham.cloud';
const COMMIT_ACTIVITY_BODY = JSON.stringify([
  { days: [1, 2, 0, 0, 0, 0, 0], total: 3, week: 1755990000 },
]);

/** Mirror of the MISS response refreshCache() stores, including its CORS headers. */
function cachedStatsResponse(): Response {
  return new Response(COMMIT_ACTIVITY_BODY, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'X-Cache': 'MISS',
      'X-RateLimit-Remaining': '50',
    },
  });
}

function getStatsRequest(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) {
    headers.set('Origin', origin);
  }
  return new Request(STATS_URL, { method: 'GET', headers });
}

async function dispatch(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

// SAFETY: workerd provides `caches.default` (Cache Storage) to code running
// inside the vitest-pool-workers isolate; the tests tsconfig does not include
// the workerd runtime declarations, hence the minimal structural declaration.
declare global {
  var caches: {
    default: {
      delete: (request: Request) => Promise<boolean>;
      put: (request: Request, response: Response) => Promise<void>;
    };
  };
}

async function seedStatsCache(): Promise<void> {
  await caches.default.delete(new Request(STATS_URL));
  await caches.default.put(new Request(STATS_URL), cachedStatsResponse());
}

describe('GET /api/github-stats CORS', () => {
  it('serves a cache MISS-stored entry as a HIT with exactly one allowed origin', async () => {
    await seedStatsCache();

    const response = await dispatch(getStatsRequest(ALLOWED_ORIGIN));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache')).toBe('HIT');
    // A duplicated header combines into "a, b" via Headers.get, which browsers reject.
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('keeps exactly one Access-Control-Allow-Origin when the caller omits Origin', async () => {
    await seedStatsCache();

    const response = await dispatch(getStatsRequest(null));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache')).toBe('HIT');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });

  it('answers preflight requests with exactly one allowed origin', async () => {
    const response = await dispatch(
      new Request(STATS_URL, {
        method: 'OPTIONS',
        headers: { Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'GET' },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });
});
