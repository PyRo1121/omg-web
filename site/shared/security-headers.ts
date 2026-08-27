/** Canonical production origin used by both web front ends. */
export const SITE_ORIGIN = 'https://omg.latham.cloud';

/** Shared browser security policy for the phased SolidStart-to-SvelteKit migration. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${SITE_ORIGIN} https://omg-api.latham.cloud https://api.github.com https://cloudflareinsights.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${SITE_ORIGIN} https://github.com`,
  "object-src 'none'",
  "worker-src 'self'",
].join('; ');

/** Headers that must cover dynamic SSR as well as static asset responses. */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

/** Apply the canonical policy without replacing route-specific cache or CORS headers. */
export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
}
