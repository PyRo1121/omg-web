/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OMG ROUTER WORKER - Production-Grade Reverse Proxy
 * Routes /docs/* to omg-docs.pages.dev with intelligent caching and asset rewriting
 * ═══════════════════════════════════════════════════════════════════════════
 */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route /docs requests to the docs site with production-ready proxy
    if (path === '/docs' || path.startsWith('/docs/')) {
      return handleDocsProxy(request, env, ctx);
    }

    // All other requests go to main site
    const mainUrl = new URL(path + url.search, env.MAIN_SITE);
    const mainRequestInit: RequestInit = {
      method: request.method,
      headers: prepareOriginHeaders(request.headers, env.MAIN_SITE),
      redirect: 'follow',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      mainRequestInit.body = request.body;
    }
    const mainRequest = new Request(mainUrl, mainRequestInit);
    return fetch(mainRequest);
  },
} satisfies ExportedHandler<Env>;

/** Route a docs request through cache lookup, origin fetch, rewriting, and cache storage. */
async function handleDocsProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const docsPath = url.pathname.replace(/^\/docs/, '') || '/';
    const targetUrl = `${env.DOCS_SITE}${docsPath}${url.search}`;
    const cachedResponse = await readDocsCache(request, targetUrl, ctx);
    if (cachedResponse !== null) {
      return cachedResponse;
    }

    const originResponse = await fetchDocsOrigin(request, targetUrl, env.DOCS_SITE);
    const redirectResponse = docsRedirect(originResponse, url.hostname, env.DOCS_SITE);
    if (redirectResponse !== null) {
      return redirectResponse;
    }

    const staleResponse = await readStaleDocsResponse(request, targetUrl, originResponse);
    if (staleResponse !== null) {
      return staleResponse;
    }

    const contentType = originResponse.headers.get('Content-Type') || '';
    const rewrittenResponse = await rewriteDocsResponse(
      originResponse,
      contentType,
      url.hostname,
      env.DOCS_SITE
    );
    return finalizeDocsResponse(
      rewrittenResponse,
      contentType,
      request,
      url.pathname,
      targetUrl,
      env.DOCS_SITE,
      ctx
    );
  } catch {
    return docsUnavailableResponse();
  }
}

async function readDocsCache(
  request: Request,
  targetUrl: string,
  ctx: ExecutionContext
): Promise<Response | null> {
  if (request.method !== 'GET') {
    return null;
  }
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, request);
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse === undefined) {
    return null;
  }
  if (cachedResponse.status < 200 || cachedResponse.status >= 300) {
    ctx.waitUntil(cache.delete(cacheKey));
    return null;
  }
  const response = new Response(cachedResponse.body, cachedResponse);
  response.headers.set('X-Cache', 'HIT');
  response.headers.set('X-Proxy', 'Cloudflare-Worker-Router');
  return response;
}

async function fetchDocsOrigin(
  request: Request,
  targetUrl: string,
  docsOrigin: string
): Promise<Response> {
  const requestInit: RequestInit = {
    method: request.method,
    headers: prepareOriginHeaders(request.headers, docsOrigin),
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    requestInit.body = request.body;
  }
  return fetch(new Request(targetUrl, requestInit));
}

function docsRedirect(response: Response, hostname: string, docsOrigin: string): Response | null {
  if (response.status < 301 || response.status > 308) {
    return null;
  }
  const location = response.headers.get('Location');
  return location === null
    ? null
    : Response.redirect(rewriteUrl(location, hostname, docsOrigin), response.status);
}

async function readStaleDocsResponse(
  request: Request,
  targetUrl: string,
  originResponse: Response
): Promise<Response | null> {
  if (originResponse.ok || originResponse.status === 304 || request.method !== 'GET') {
    return null;
  }
  const staleResponse = await caches.default.match(new Request(targetUrl, request));
  if (staleResponse === undefined) {
    return null;
  }
  const fallback = new Response(staleResponse.body, staleResponse);
  fallback.headers.set('X-Cache', 'STALE-ON-ERROR');
  fallback.headers.set('X-Proxy', 'Cloudflare-Worker-Router');
  return fallback;
}

async function rewriteDocsResponse(
  response: Response,
  contentType: string,
  hostname: string,
  docsOrigin: string
): Promise<Response> {
  const isHtml = contentType.includes('text/html');
  const isCss = contentType.includes('text/css');
  const isJavaScript = contentType.includes('javascript') || contentType.includes('ecmascript');
  if ((!isHtml && !isCss && !isJavaScript) || response.body === null) {
    return response;
  }
  const rewritten = rewriteContent(
    await response.text(),
    isHtml,
    isCss,
    isJavaScript,
    hostname,
    docsOrigin
  );
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(rewritten));
      controller.close();
    },
  });
  return new Response(body, response);
}

function finalizeDocsResponse(
  response: Response,
  contentType: string,
  request: Request,
  pathname: string,
  targetUrl: string,
  docsOrigin: string,
  ctx: ExecutionContext
): Response {
  const headers = docsResponseHeaders(response, contentType, request.method, pathname, docsOrigin);
  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (shouldStoreDocsResponse(response, request.method, pathname, contentType)) {
    const cacheKey = new Request(targetUrl, request);
    ctx.waitUntil(caches.default.put(cacheKey, finalResponse.clone()));
  }
  return finalResponse;
}

function docsResponseHeaders(
  response: Response,
  contentType: string,
  method: string,
  pathname: string,
  docsOrigin: string
): Headers {
  const headers = new Headers(response.headers);
  headers.set('X-Cache', 'MISS');
  headers.set('X-Proxy', 'Cloudflare-Worker-Router');
  headers.set('X-Docs-Origin', docsOrigin);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  const isSuccess = response.status >= 200 && response.status < 300;
  if (isSuccess && method === 'GET' && shouldCache(pathname, contentType)) {
    const cacheTtl = getCacheTtl(pathname, contentType);
    headers.set('Cache-Control', `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}, immutable`);
  } else if (!isSuccess) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  return headers;
}

function shouldStoreDocsResponse(
  response: Response,
  method: string,
  pathname: string,
  contentType: string
): boolean {
  return (
    response.status >= 200 &&
    response.status < 300 &&
    method === 'GET' &&
    shouldCache(pathname, contentType)
  );
}

function docsUnavailableResponse(): Response {
  return new Response('Docs temporarily unavailable', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain',
      'X-Proxy-Error': 'true',
      'Retry-After': '60',
    },
  });
}

/**
 * Prepare headers for origin request
 * Strips hop-by-hop headers and adds proper Host header
 */
function prepareOriginHeaders(headers: Headers, origin: string): Headers {
  const newHeaders = new Headers();

  // Copy all headers except hop-by-hop headers
  const hopByHopHeaders = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host', // Will set this manually
  ];

  for (const [key, value] of headers.entries()) {
    if (!hopByHopHeaders.includes(key.toLowerCase())) {
      newHeaders.set(key, value);
    }
  }

  // Set proper Host header for origin
  const originHost = new URL(origin).hostname;
  newHeaders.set('Host', originHost);

  // Set X-Forwarded headers
  newHeaders.set('X-Forwarded-Proto', 'https');

  // Add user agent if missing
  if (!newHeaders.has('User-Agent')) {
    newHeaders.set('User-Agent', 'Cloudflare-Worker-Router/2.0');
  }

  return newHeaders;
}

/**
 * Rewrite content to fix asset paths
 * Converts omg-docs.pages.dev URLs to /docs/ URLs
 */
function rewriteContent(
  content: string,
  isHTML: boolean,
  isCSS: boolean,
  isJS: boolean,
  hostname: string,
  docsOrigin: string
): string {
  let rewritten = content;
  const docsHostname = new URL(docsOrigin).hostname;

  if (isHTML) {
    // Rewrite absolute URLs in HTML
    rewritten = rewritten
      // Fix href and src attributes
      .replace(
        new RegExp(`href="https?:\\/\\/[^\\"]*${docsHostname.replace('.', '\\.')}([^\\"]*)"`, 'g'),
        `href="https://${hostname}/docs$1"`
      )
      .replace(
        new RegExp(`src="https?:\\/\\/[^\\"]*${docsHostname.replace('.', '\\.')}([^\\"]*)"`, 'g'),
        `src="https://${hostname}/docs$1"`
      )
      // Fix base href if present
      .replace(
        new RegExp(`<base\\s+href="[^\\"]*${docsHostname.replace('.', '\\.')}([^\\"]*)"`, 'g'),
        `<base href="https://${hostname}/docs$1"`
      )
      // Fix meta tags
      .replace(
        new RegExp(
          `content="https?:\\/\\/[^\\"]*${docsHostname.replace('.', '\\.')}([^\\"]*)"`,
          'g'
        ),
        `content="https://${hostname}/docs$1"`
      )
      // Fix JSON-LD and structured data
      .replace(
        new RegExp(`https?:\\/\\/[^\\"]*${docsHostname.replace('.', '\\.')}`, 'g'),
        `https://${hostname}/docs`
      );
  }

  if (isCSS) {
    // Rewrite URLs in CSS url() functions
    rewritten = rewritten
      .replace(
        new RegExp(
          `url\\(["']?https?:\\/\\/[^)\\"']*${docsHostname.replace('.', '\\.')}([^)\\"']*)["']?\\)`,
          'g'
        ),
        `url("https://${hostname}/docs$1")`
      )
      .replace(/url\(["']?\/([^)"']*)["']?\)/g, `url("/docs/$1")`);
  }

  if (isJS) {
    // Rewrite URLs in JavaScript strings (careful to not break code)
    rewritten = rewritten
      .replace(
        new RegExp(`"https?:\\/\\/[^\\"]*${docsHostname.replace('.', '\\.')}([^\\"]*)"`, 'g'),
        `"https://${hostname}/docs$1"`
      )
      .replace(
        new RegExp(`'https?:\\/\\/[^']*${docsHostname.replace('.', '\\.')}([^']*)'`, 'g'),
        `'https://${hostname}/docs$1'`
      );
  }

  return rewritten;
}

/**
 * Rewrite redirect URLs
 */
function rewriteUrl(url: string, hostname: string, docsOrigin: string): string {
  try {
    // Handle relative URLs (like /quickstart/)
    if (url.startsWith('/')) {
      return `https://${hostname}/docs${url}`;
    }

    // Handle absolute URLs
    const parsed = new URL(url);
    const docsHostname = new URL(docsOrigin).hostname;
    if (parsed.hostname.includes(docsHostname)) {
      return `https://${hostname}/docs${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return url;
  } catch {
    // If URL parsing fails, assume it's relative
    if (url.startsWith('/')) {
      return `https://${hostname}/docs${url}`;
    }
    return url;
  }
}

/**
 * Determine if resource should be cached
 */
function shouldCache(pathname: string, contentType: string): boolean {
  // Always cache static assets
  if (pathname.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico|pdf)$/i)) {
    return true;
  }

  // Cache HTML with shorter TTL
  if (contentType.includes('text/html')) {
    return true;
  }

  // Cache JSON API responses
  if (contentType.includes('application/json')) {
    return true;
  }

  return false;
}

/**
 * Get cache TTL based on content type and path
 */
function getCacheTtl(pathname: string, contentType: string): number {
  // Immutable assets (hashed filenames) - cache for 1 year
  if (pathname.match(/[a-f0-9]{8,}\.[a-f0-9]{8,}\.(js|css)$/i)) {
    return 31536000; // 1 year
  }

  // Images and fonts - cache for 7 days
  if (pathname.match(/\.(woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/i)) {
    return 604800; // 7 days
  }

  // Regular JS/CSS - cache for 1 day
  if (pathname.match(/\.(js|css)$/i)) {
    return 86400; // 1 day
  }

  // HTML - cache for 5 minutes (allows quick updates)
  if (contentType.includes('text/html')) {
    return 300; // 5 minutes
  }

  // JSON - cache for 1 minute
  if (contentType.includes('application/json')) {
    return 60; // 1 minute
  }

  // Default - cache for 1 hour
  return 3600; // 1 hour
}
