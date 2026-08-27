import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '../shared/public-site';
import { CONTENT_SECURITY_POLICY } from '../shared/security-headers';
import { applyResponsePolicy } from './middleware';

describe('structured data serialization', () => {
  it('neutralizes script-text breakouts and JavaScript line separators', () => {
    const serialized = serializeJsonLd({ value: '</script>\u2028\u2029' });

    expect(serialized).toBe('{"value":"\\u003c/script>\\u2028\\u2029"}');
  });
});

describe('SolidStart response policy', () => {
  it('protects dynamic admin HTML and prevents shared caching', () => {
    const headers = new Headers();

    applyResponsePolicy('https://omg.latham.cloud/admin', headers);

    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Cache-Control')).toBe('private, no-store, no-cache, must-revalidate');
  });

  it('keeps the static Cloudflare CSP aligned with the runtime policy', async () => {
    const staticHeaders = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');

    expect(staticHeaders).toContain(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`);
  });

  it('does not replace route-specific caching on public pages', () => {
    const headers = new Headers({ 'Cache-Control': 'public, max-age=60' });

    applyResponsePolicy('https://omg.latham.cloud/docs/', headers);

    expect(headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
  });
});
