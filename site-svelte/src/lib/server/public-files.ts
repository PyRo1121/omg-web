const SITE_URL = 'https://omg.latham.cloud';
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${SITE_URL} https://omg-api.latham.cloud https://api.github.com https://cloudflareinsights.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${SITE_URL} https://github.com`,
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

const SHADOW_ROBOTS_POLICY = 'noindex, nofollow';

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
    <loc>${escapeXml(`${SITE_URL}${page.path}`)}</loc>
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
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
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

export function robotsResponse(): Response {
  const body = `# OMG Package Manager - robots.txt
# https://omg.latham.cloud

User-agent: *
Disallow: /api/
Disallow: /dashboard
Disallow: /admin
Disallow: /_server/
Allow: /_build/

Sitemap: ${SITE_URL}/sitemap.xml
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
