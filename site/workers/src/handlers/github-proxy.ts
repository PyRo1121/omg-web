import { reportError, reportWarning } from '../observability';
import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { errorResponse, getCorsHeaders } from '../api';
import {
  GitHubCommitActivityResponseSchema,
  type GitHubCommitActivityResponse,
} from '../contracts/provider-boundaries';

const CACHE_TTL = 120;
const STALE_TTL = 3600;

/**
 * Copy cached response headers and override cache/CORS metadata without ever
 * emitting duplicate header values: spreading raw cached header records next
 * to capitalized overrides lets the Headers constructor append same-name
 * entries (e.g. two Access-Control-Allow-Origin values), which browsers reject.
 */
function withCacheOverrides(
  cachedHeaders: Headers,
  cacheState: 'HIT' | 'STALE',
  age: number,
  cors: ReturnType<typeof getCorsHeaders>
): Headers {
  const headers = new Headers(cachedHeaders);
  for (const [name, value] of Object.entries(cors)) {
    headers.set(name, value);
  }
  headers.set('X-Cache', cacheState);
  headers.set('X-Cache-Age', age.toString());
  return headers;
}

export async function handleGitHubProxy(
  request: Request,
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
    const age = parseInt(cachedResponse.headers.get('Age') || '0', 10);

    if (age < CACHE_TTL) {
      return new Response(cachedResponse.body, {
        headers: withCacheOverrides(
          cachedResponse.headers,
          'HIT',
          age,
          getCorsHeaders(request.headers.get('Origin'))
        ),
      });
    }

    if (age < STALE_TTL) {
      // Never let background refresh failures bubble as uncaught Worker exceptions.
      ctx.waitUntil(
        refreshCache(cache, cacheKey, request.headers.get('Origin')).catch(error => {
          reportError('GitHub cache background refresh failed:', error);
        })
      );

      return new Response(cachedResponse.body, {
        headers: withCacheOverrides(
          cachedResponse.headers,
          'STALE',
          age,
          getCorsHeaders(request.headers.get('Origin'))
        ),
      });
    }
  }

  return refreshCache(cache, cacheKey, request.headers.get('Origin'));
}

async function refreshCache(
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
    reportError('GitHub API network error:', error);
    return errorResponse('GitHub API unreachable', 503);
  }

  const remaining = ghResponse.headers.get('X-RateLimit-Remaining');
  if (remaining && parseInt(remaining, 10) < 10) {
    reportWarning(`GitHub rate limit low: ${remaining} requests remaining`);
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
    reportError(`GitHub API error: ${ghResponse.status}`);
    return errorResponse(`GitHub API error: ${ghResponse.status}`, ghResponse.status);
  }

  const decodedData = await Effect.runPromiseExit(
    Effect.tryPromise({
      try: () => ghResponse.json(),
      catch: cause => new Error('GitHub response body was not valid JSON', { cause }),
    }).pipe(Effect.flatMap(Schema.decodeUnknown(GitHubCommitActivityResponseSchema)))
  );
  if (Exit.isFailure(decodedData)) {
    reportError('GitHub API returned an invalid commit activity payload');
    return errorResponse('GitHub API returned invalid data', 502);
  }
  const data: GitHubCommitActivityResponse = decodedData.value;
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
    reportWarning('Failed to write GitHub response to cache:', error);
  }

  return response;
}
