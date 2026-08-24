import type { APIEvent } from '@solidjs/start/server';

// Site configuration
const SITE_URL = 'https://omg.latham.cloud';

// Static pages with their priorities and change frequencies
interface PageEntry {
  path: string;
  priority: number;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

const STATIC_PAGES: PageEntry[] = [
  { path: '/', priority: 1.0, changefreq: 'weekly' },
  { path: '/docs', priority: 0.9, changefreq: 'weekly' },
  { path: '/privacy', priority: 0.3, changefreq: 'yearly' },
  { path: '/terms', priority: 0.3, changefreq: 'yearly' },
];

/**
 * Generate XML for a single URL entry
 */
function generateUrlEntry(page: PageEntry, baseUrl: string): string {
  const loc = `${baseUrl}${page.path}`;

  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate the complete sitemap XML
 */
function generateSitemap(): string {
  const allPages = STATIC_PAGES;

  const urlEntries = allPages.map(page => generateUrlEntry(page, SITE_URL)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
                            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlEntries}
</urlset>`;
}

/**
 * API route handler for sitemap.xml
 */
export function GET(_event: APIEvent): Response {
  const sitemap = generateSitemap();

  return new Response(sitemap, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Robots-Tag': 'noindex',
    },
  });
}
