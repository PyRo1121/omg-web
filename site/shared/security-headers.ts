/** Canonical production origin used by both web front ends. */
export const SITE_ORIGIN = 'https://omg.latham.cloud';

const DEFAULT_SOURCE_POLICY = "default-src 'self'";
const SCRIPT_SOURCE_POLICY = "script-src 'self' https://static.cloudflareinsights.com";
const NON_SCRIPT_DIRECTIVES = [
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${SITE_ORIGIN} https://omg-api.latham.cloud https://api.github.com https://cloudflareinsights.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${SITE_ORIGIN} https://github.com`,
  "object-src 'none'",
  "worker-src 'self'",
];

/** Strict fallback policy for non-HTML responses and static resources. */
export const CONTENT_SECURITY_POLICY = [
  DEFAULT_SOURCE_POLICY,
  SCRIPT_SOURCE_POLICY,
  ...NON_SCRIPT_DIRECTIVES,
].join('; ');

/** Generate a request-local CSP nonce using 128 bits from Web Crypto. */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

const CSP_SOURCE_VALUE = /^[0-9A-Za-z+/_-]+={0,2}$/u;

/** Add one validated request-local nonce to the strict script policy. */
export function contentSecurityPolicyWithNonce(nonce: string): string {
  if (!CSP_SOURCE_VALUE.test(nonce)) {
    throw new Error('Invalid CSP nonce');
  }
  const scriptPolicy = `${SCRIPT_SOURCE_POLICY} 'nonce-${nonce}'`;
  return [DEFAULT_SOURCE_POLICY, scriptPolicy, ...NON_SCRIPT_DIRECTIVES].join('; ');
}

/** Add build-time SHA-256 sources for inline scripts in one prerendered document. */
export function contentSecurityPolicyWithScriptHashes(hashes: ReadonlyArray<string>): string {
  if (hashes.some(hash => !CSP_SOURCE_VALUE.test(hash))) {
    throw new Error('Invalid CSP script hash');
  }
  const hashSources = hashes.map(hash => `'sha256-${hash}'`).join(' ');
  const scriptPolicy = hashSources
    ? `${SCRIPT_SOURCE_POLICY} ${hashSources}`
    : SCRIPT_SOURCE_POLICY;
  return [DEFAULT_SOURCE_POLICY, scriptPolicy, ...NON_SCRIPT_DIRECTIVES].join('; ');
}

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
