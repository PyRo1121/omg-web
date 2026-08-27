import { applySecurityHeaders, SITE_ORIGIN } from '../../../../site/shared/security-headers';

const SHADOW_ROBOTS_POLICY = 'noindex, nofollow';
const DOCS_CACHE_POLICY = 'public, max-age=0, must-revalidate';

interface PageEntry {
  readonly changeFrequency: 'weekly' | 'yearly';
  readonly lastModified: string;
  readonly path: string;
  readonly priority: number;
}

const STATIC_PAGES = [
  { path: '/', priority: 1, changeFrequency: 'weekly', lastModified: '2026-08-25' },
  { path: '/docs/', priority: 0.9, changeFrequency: 'weekly', lastModified: '2026-08-25' },
  { path: '/privacy/', priority: 0.3, changeFrequency: 'yearly', lastModified: '2026-02-07' },
  { path: '/terms/', priority: 0.3, changeFrequency: 'yearly', lastModified: '2026-02-07' },
] as const satisfies readonly PageEntry[];

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sitemapEntry(page: PageEntry): string {
  return `  <url>
    <loc>${escapeXml(`${SITE_ORIGIN}${page.path}`)}</loc>
    <lastmod>${page.lastModified}</lastmod>
    <changefreq>${page.changeFrequency}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
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
  applySecurityHeaders(headers);
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
 */
export function withDocsRouteCache(response: Response, method: string, pathname: string): Response {
  const isRead = method === 'GET' || method === 'HEAD';
  const isSuccessful = response.status >= 200 && response.status < 300;
  if (!isRead || pathname !== '/docs/' || !isSuccessful) {
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
Disallow: /dashboard
Disallow: /admin
Disallow: /_server/
Allow: /_build/

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
  const entries = STATIC_PAGES.map(sitemapEntry).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
                            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
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
