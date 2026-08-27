import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '../shared/public-site';
import {
  contentSecurityPolicyWithNonce,
  contentSecurityPolicyWithScriptHashes,
  createCspNonce,
} from '../shared/security-headers';
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
    expect(headers.get('Content-Security-Policy')).toContain(
      "img-src 'self' data: https://avatars.githubusercontent.com"
    );
    expect(headers.get('Content-Security-Policy')).not.toContain("img-src 'self' data: https:;");
    expect(headers.get('Content-Security-Policy')).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
    expect(headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Cache-Control')).toBe('private, no-store, no-cache, must-revalidate');
  });

  it('preserves a request-local rendering nonce', () => {
    const nonce = createCspNonce();
    const renderedPolicy = contentSecurityPolicyWithNonce(nonce);
    const headers = new Headers({ 'Content-Security-Policy': renderedPolicy });

    applyResponsePolicy('https://omg.latham.cloud/dashboard/', headers);

    expect(nonce).toMatch(/^[0-9A-Za-z+/]+={0,2}$/);
    expect(headers.get('Content-Security-Policy')).toBe(renderedPolicy);
    expect(renderedPolicy).toContain(`'nonce-${nonce}'`);
    expect(renderedPolicy).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
  });

  it('rejects malformed rendering nonces', () => {
    expect(() => contentSecurityPolicyWithNonce("bad' nonce")).toThrow('Invalid CSP nonce');
  });

  it('leaves prerendered CSP to generated route-specific hash policies', async () => {
    const staticHeaders = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
    const hashedPolicy = contentSecurityPolicyWithScriptHashes(['YWJjZA==']);

    expect(staticHeaders).not.toContain('Content-Security-Policy:');
    expect(hashedPolicy).toContain("'sha256-YWJjZA=='");
    expect(hashedPolicy).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
  });

  it('does not replace route-specific caching on public pages', () => {
    const headers = new Headers({ 'Cache-Control': 'public, max-age=60' });

    applyResponsePolicy('https://omg.latham.cloud/docs/', headers);

    expect(headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
  });
});
