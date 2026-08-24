import type { APIEvent } from '@solidjs/start/server';

// Site configuration
const SITE_URL = 'https://omg.latham.cloud';

/**
 * Generate robots.txt content
 *
 * This allows crawlers to reach HTML pages (including pages with `noindex`) while
 * disallowing API and server-function routes, and referencing the sitemap for
 * discovery. Hydration assets under /_build/ must stay crawlable so Googlebot
 * can render the JS-driven pages.
 */
function generateRobotsTxt(): string {
  return `# OMG Package Manager - robots.txt
# https://omg.latham.cloud

# Allow all crawlers
User-agent: *

# Disallow non-page routes
Disallow: /api/

# Disallow SolidStart server functions; keep hydration bundles crawlable
Disallow: /_server/
Allow: /_build/

# Sitemap location
Sitemap: ${SITE_URL}/sitemap.xml

# Specific rules for aggressive bots
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: ClaudeBot
Disallow: /
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
