import { type Env, errorResponse, getCorsHeaders } from '../api';

interface GitHubCommitActivity {
  days: number[];
  total: number;
  week: number;
}

const CACHE_TTL = 120;
const STALE_TTL = 3600;

export async function handleGitHubProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...getCorsHeaders(request.headers.get('Origin')),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, request);

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const age = parseInt(cachedResponse.headers.get('Age') || '0');

    if (age < CACHE_TTL) {
      return new Response(cachedResponse.body, {
        headers: {
          ...Object.fromEntries(cachedResponse.headers),
          'X-Cache': 'HIT',
          'X-Cache-Age': age.toString(),
          ...getCorsHeaders(request.headers.get('Origin')),
        },
      });
    }

    if (age < STALE_TTL) {
      // Never let background refresh failures bubble as uncaught Worker exceptions.
      ctx.waitUntil(
        refreshCache(env, cache, cacheKey, request.headers.get('Origin')).catch(error => {
          console.error('GitHub cache background refresh failed:', error);
        })
      );

      return new Response(cachedResponse.body, {
        headers: {
          ...Object.fromEntries(cachedResponse.headers),
          'X-Cache': 'STALE',
          'X-Cache-Age': age.toString(),
          ...getCorsHeaders(request.headers.get('Origin')),
        },
      });
    }
  }

  return await refreshCache(env, cache, cacheKey, request.headers.get('Origin'));
}

async function refreshCache(
  env: Env,
  cache: Cache,
  cacheKey: Request,
  origin: string | null
): Promise<Response> {
  let ghResponse: Response;
  try {
    ghResponse = await fetch('https://api.github.com/repos/PyRo1121/omg/stats/commit_activity', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'OMG-Package-Manager-Site/1.0',
      },
    });
  } catch (error: unknown) {
    console.error('GitHub API network error:', error);
    return errorResponse('GitHub API unreachable', 503);
  }

  const remaining = ghResponse.headers.get('X-RateLimit-Remaining');
  if (remaining && parseInt(remaining) < 10) {
    console.warn(`GitHub rate limit low: ${remaining} requests remaining`);
  }

  if (ghResponse.status === 202) {
    return new Response(
      JSON.stringify({
        computing: true,
        message: 'GitHub is computing statistics. Please try again in 60 seconds.',
      }),
      {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Retry-After': '60',
          ...getCorsHeaders(origin),
          'X-GitHub-Status': 'computing',
        },
      }
    );
  }

  if (!ghResponse.ok) {
    console.error(`GitHub API error: ${ghResponse.status}`);
    return errorResponse(`GitHub API error: ${ghResponse.status}`, ghResponse.status);
  }

  const data: GitHubCommitActivity[] = await ghResponse.json();
  const responseBody = JSON.stringify(data);

  const response = new Response(responseBody, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=${STALE_TTL}`,
      ...getCorsHeaders(origin),
      'X-Cache': 'MISS',
      'X-RateLimit-Remaining': remaining || 'unknown',
    },
  });

  try {
    await cache.put(cacheKey, response.clone());
  } catch (error: unknown) {
    console.warn('Failed to write GitHub response to cache:', error);
  }

  return response;
}
