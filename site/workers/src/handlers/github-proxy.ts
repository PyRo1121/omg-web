import { reportError, reportWarning } from '../observability';
import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { errorResponse, getCorsHeaders } from '../api';
import { GitHubCommitActivityResponseSchema } from '../contracts/provider-boundaries';

const CACHE_TTL_SECONDS = 120;
const STALE_TTL_SECONDS = 3600;
const GITHUB_COMMIT_ACTIVITY_URL =
  'https://api.github.com/repos/PyRo1121/omg/stats/commit_activity';
const RETRY_AFTER_SECONDS = 60;
/** Internal header recording when a response entered the edge cache. */
const STORED_AT_HEADER = 'X-OMG-Stored-At';
const CLIENT_CACHE_CONTROL = `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_TTL_SECONDS}`;
/** GitHub warns below this many remaining authenticated requests. */
const RATE_LIMIT_WARNING_THRESHOLD = 10;

/** GitHub returned a response body that did not match the provider contract. */
class GitHubProviderPayloadError extends Error {
  readonly _tag = 'GitHubProviderPayloadError';

  constructor(
    readonly reason: string,
    override readonly cause: unknown
  ) {
    super(reason);
  }
}

/**
 * HTTP adapter for `GET /api/github-stats`.
 *
 * Serves GitHub commit activity through `caches.default` with explicit
 * stale-while-revalidate: entries are stored under an edge-only long
 * `max-age` plus a {@link STORED_AT_HEADER} timestamp so they remain
 * matchable through the stale window while clients receive the short,
 * browser-facing cache policy.
 *
 * @param request - Incoming request (route table guarantees GET).
 * @param ctx - Execution context used to schedule background refreshes.
 * @returns Cached or freshly fetched commit-activity JSON.
 */
export async function handleGitHubProxy(
  request: Request,
  ctx: ExecutionContext
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = getCorsHeaders(origin);

  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const originUrl = URL.parse(request.url);
  if (originUrl === null) {
    return errorResponse('Invalid request URL', 400);
  }

  const cache = caches.default;
  // Cache key ignores the query string: arbitrary attacker-controlled query
  // params would otherwise fragment the cache and multiply upstream calls.
  const cacheKey = new Request(originUrl.origin + originUrl.pathname, {
    method: 'GET',
    headers: request.headers,
  });

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const ageSeconds = cacheEntryAgeSeconds(cachedResponse);
    if (ageSeconds < STALE_TTL_SECONDS) {
      const cacheState = ageSeconds < CACHE_TTL_SECONDS ? 'HIT' : 'STALE';
      if (cacheState === 'STALE') {
        // Never let background refresh failures bubble as uncaught Worker exceptions.
        ctx.waitUntil(
          refreshCache(cache, cacheKey, origin).catch(error => {
            reportError('GitHub cache background refresh failed:', error);
          })
        );
      }

      // Override through Headers.set so cached and CORS names cannot be duplicated.
      const headers = new Headers(cachedResponse.headers);
      for (const [name, value] of Object.entries(cors)) {
        headers.set(name, value);
      }
      headers.delete(STORED_AT_HEADER);
      headers.set('Cache-Control', CLIENT_CACHE_CONTROL);
      headers.set('X-Cache', cacheState);
      headers.set('X-Cache-Age', ageSeconds.toString());
      return new Response(cachedResponse.body, { headers });
    }
  }

  return refreshCache(cache, cacheKey, origin);
}

/**
 * Compute the age of a cached entry from its stored-at timestamp.
 *
 * Legacy or malformed entries without a parseable timestamp report age 0:
 * they can only be served within their own stored `max-age` window, which
 * keeps pre-deploy behavior intact without trusting an unchecked header.
 */
function cacheEntryAgeSeconds(cachedResponse: Response): number {
  const rawStoredAt = cachedResponse.headers.get(STORED_AT_HEADER);
  if (rawStoredAt === null) {
    return 0;
  }
  const storedAtMs = Number(rawStoredAt);
  if (!Number.isFinite(storedAtMs) || storedAtMs <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - storedAtMs) / 1000));
}

/**
 * Fetch commit activity from GitHub, validate it against the provider
 * contract, store it in the edge cache, and render it to the caller.
 * Failures never touch the existing cache entry, so stale data survives
 * upstream outages until a successful refresh overwrites it.
 */
async function refreshCache(
  cache: Cache,
  cacheKey: Request,
  origin: string | null
): Promise<Response> {
  let ghResponse: Response;
  try {
    ghResponse = await fetch(GITHUB_COMMIT_ACTIVITY_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'OMG-Package-Manager-Site/1.0',
      },
    });
  } catch (error: unknown) {
    reportError('GitHub API network error:', error);
    return errorResponse('GitHub API unreachable', 503);
  }

  const remainingRequests = parseRemainingRateLimit(ghResponse.headers);
  if (remainingRequests !== null && remainingRequests < RATE_LIMIT_WARNING_THRESHOLD) {
    reportWarning(`GitHub rate limit low: ${remainingRequests} requests remaining`);
  }

  if (ghResponse.status === 202) {
    return new Response(
      JSON.stringify({
        computing: true,
        message: `GitHub is computing statistics. Please try again in ${RETRY_AFTER_SECONDS} seconds.`,
      }),
      {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Retry-After': RETRY_AFTER_SECONDS.toString(),
          ...getCorsHeaders(origin),
          'X-GitHub-Status': 'computing',
        },
      }
    );
  }

  if (!ghResponse.ok) {
    // Keep the real upstream status server-side; visitors get a generic
    // gateway error so provider coupling and auth states are not leaked.
    reportError(`GitHub API error: ${ghResponse.status}`);
    return errorResponse('GitHub API unavailable', 502);
  }

  const decodedData = await Effect.runPromiseExit(
    Effect.tryPromise({
      try: () => ghResponse.json(),
      catch: cause =>
        new GitHubProviderPayloadError('GitHub response body was not valid JSON', cause),
    }).pipe(
      Effect.flatMap(payload =>
        Schema.decodeUnknown(GitHubCommitActivityResponseSchema)(payload).pipe(
          Effect.mapError(
            cause =>
              new GitHubProviderPayloadError(
                'GitHub commit activity payload had an invalid shape',
                cause
              )
          )
        )
      )
    )
  );
  if (Exit.isFailure(decodedData)) {
    reportError('GitHub API returned an invalid commit activity payload');
    return errorResponse('GitHub API returned invalid data', 502);
  }

  const responseBody = JSON.stringify(decodedData.value);
  const remainingHeader = remainingRequests === null ? 'unknown' : remainingRequests.toString();
  const clientHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': CLIENT_CACHE_CONTROL,
    ...getCorsHeaders(origin),
    'X-Cache': 'MISS',
    'X-RateLimit-Remaining': remainingHeader,
  });

  // The edge copy stays matchable for the whole stale window; per-entry age
  // is tracked by STORED_AT_HEADER instead of the client-facing max-age.
  const cacheHeaders = new Headers(clientHeaders);
  cacheHeaders.set('Cache-Control', `public, max-age=${STALE_TTL_SECONDS}`);
  cacheHeaders.set(STORED_AT_HEADER, Date.now().toString());
  const cachedCopy = new Response(responseBody, { headers: cacheHeaders });

  const clientResponse = new Response(responseBody, { headers: clientHeaders });

  try {
    await cache.put(cacheKey, cachedCopy);
  } catch (error: unknown) {
    reportWarning('Failed to write GitHub response to cache:', error);
  }

  return clientResponse;
}

/**
 * Parse the upstream `X-RateLimit-Remaining` header into a non-negative
 * integer, or `null` when it is absent or malformed.
 */
function parseRemainingRateLimit(headers: Headers): number | null {
  const raw = headers.get('X-RateLimit-Remaining');
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
