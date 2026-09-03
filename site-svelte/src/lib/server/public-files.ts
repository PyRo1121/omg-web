import { applySecurityHeaders, SITE_ORIGIN } from '../../../../shared/security-headers';
import { DOCS_TOPICS, docsTopicHref } from '../docs/topics';

const SHADOW_ROBOTS_POLICY = 'noindex, nofollow';
const DOCS_CACHE_POLICY = 'public, max-age=0, must-revalidate';

const STATIC_PAGE_PATHS = ['/', '/docs/', '/privacy/', '/terms/'] as const;
const DOCS_TOPIC_PATHS = DOCS_TOPICS.map(topic => docsTopicHref(topic.slug));

type SitemapPath = (typeof STATIC_PAGE_PATHS)[number] | ReturnType<typeof docsTopicHref>;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sitemapEntry(path: SitemapPath): string {
  return `  <url>
    <loc>${escapeXml(`${SITE_ORIGIN}${path}`)}</loc>
  </url>`;
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get('Vary');
  const values = current?.split(',').map(item => item.trim().toLowerCase()) ?? [];
  if (!values.includes(value.toLowerCase())) {
    headers.set('Vary', current ? `${current}, ${value}` : value);
  }
}

export function withSiteHeaders(response: Response, deploymentStage: string | undefined): Response {
  const headers = new Headers(response.headers);
  const renderedContentSecurityPolicy = headers.get('Content-Security-Policy');
  applySecurityHeaders(headers);
  if (renderedContentSecurityPolicy !== null) {
    headers.set('Content-Security-Policy', renderedContentSecurityPolicy);
  }
  appendVary(headers, 'Accept-Encoding');
  if (deploymentStage !== 'prod') {
    headers.set('X-Robots-Tag', SHADOW_ROBOTS_POLICY);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/**
 * Apply the production cache policy only to successful, read-only docs responses.
 * The policy covers the docs index and every curated topic page under /docs/.
 */
export function withDocsRouteCache(response: Response, method: string, pathname: string): Response {
  const isRead = method === 'GET' || method === 'HEAD';
  const isDocsPath = pathname.startsWith('/docs/');
  const isSuccessful = response.status >= 200 && response.status < 300;
  if (!isRead || !isDocsPath || !isSuccessful) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', DOCS_CACHE_POLICY);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function robotsResponse(): Response {
  const body = `# OMG Package Manager - robots.txt
# https://omg.latham.cloud

User-agent: *
Disallow: /api/
Disallow: /dashboard/
Disallow: /admin/

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export function sitemapResponse(): Response {
  const entries = [...STATIC_PAGE_PATHS, ...DOCS_TOPIC_PATHS].map(sitemapEntry).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export function healthResponse(): Response {
  return Response.json(
    {
      runtime: 'sveltekit-alchemy',
      status: 'ok',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
