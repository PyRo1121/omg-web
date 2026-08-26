import { describe, expect, it } from 'vitest';
import { healthResponse, robotsResponse, sitemapResponse, withSiteHeaders } from './public-files';

describe('public migration endpoints', () => {
  it('preserves the production robots policy', async () => {
    const response = robotsResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=604800');
    await expect(response.text()).resolves.toBe(`# OMG Package Manager - robots.txt
# https://omg.latham.cloud

User-agent: *
Disallow: /api/
Disallow: /dashboard
Disallow: /admin
Disallow: /_server/
Allow: /_build/

Sitemap: https://omg.latham.cloud/sitemap.xml
`);
  });

  it('publishes only the four canonical public pages', async () => {
    const response = sitemapResponse();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(body.match(/<url>/g)).toHaveLength(4);
    expect(body).toContain('<loc>https://omg.latham.cloud/</loc>');
    expect(body).toContain('<loc>https://omg.latham.cloud/docs/</loc>');
    expect(body).toContain('<loc>https://omg.latham.cloud/privacy/</loc>');
    expect(body).toContain('<loc>https://omg.latham.cloud/terms/</loc>');
  });

  it('reports health without a fabricated timestamp', async () => {
    const response = healthResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.text()).resolves.toBe(
      JSON.stringify({ runtime: 'sveltekit-alchemy', status: 'ok' })
    );
  });

  it('adds the shared security policy and keeps shadow stages out of search', () => {
    const response = withSiteHeaders(new Response('ok'), 'shadow');

    const contentSecurityPolicy = response.headers.get('content-security-policy');
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain(
      "form-action 'self' https://omg.latham.cloud https://github.com"
    );
    expect(contentSecurityPolicy).not.toContain('accounts.google.com');
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains; preload'
    );
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('does not add a shadow robots policy to the production stage', () => {
    const response = withSiteHeaders(new Response('ok', { headers: { Vary: 'Origin' } }), 'prod');

    expect(response.headers.get('vary')).toBe('Origin, Accept-Encoding');
    expect(response.headers.has('x-robots-tag')).toBe(false);
  });
});
