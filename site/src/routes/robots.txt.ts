import type { APIEvent } from '@solidjs/start/server';

// Site configuration
const SITE_URL = 'https://omg.latham.cloud';

/**
 * Generate robots.txt content
 *
 * All crawlers are welcome — abusive traffic is handled by Cloudflare's bot
 * management at the edge, not in application code. Disallow only non-page
 * routes: API, authenticated app shells, and SolidStart server functions.
 * Hydration assets under /_build/ stay crawlable so Googlebot can render
 * the JS-driven pages.
 */
function generateRobotsTxt(): string {
  return `# OMG Package Manager - robots.txt
# https://omg.latham.cloud

User-agent: *
Disallow: /api/
Disallow: /dashboard
Disallow: /admin
Disallow: /_server/
Allow: /_build/

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

/**
 * API route handler for robots.txt
 */
export function GET(_event: APIEvent): Response {
  const robotsTxt = generateRobotsTxt();

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
}
