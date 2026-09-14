const DEFAULT_SOURCE_POLICY = "default-src 'self'";
const SCRIPT_SOURCE_POLICY = "script-src 'self' https://static.cloudflareinsights.com";
const NON_SCRIPT_DIRECTIVES = [
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://cloudflareinsights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self'",
];

/** Strict fallback policy for non-HTML responses and static resources. */
const CONTENT_SECURITY_POLICY = [
  DEFAULT_SOURCE_POLICY,
  SCRIPT_SOURCE_POLICY,
  ...NON_SCRIPT_DIRECTIVES,
].join('; ');

/** Headers that must cover dynamic SSR as well as static asset responses. */
const SECURITY_HEADERS = {
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
