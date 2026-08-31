const SESSION_TOKEN_DIGEST_PREFIX = 'sha256:v1:';
const SITE_SESSION_DOMAIN = 'omg:site-session:v1';

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** One-way, versioned representation persisted for Worker session lookup. */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return `${SESSION_TOKEN_DIGEST_PREFIX}${hex(digest)}`;
}

/**
 * Recreate a stable private-BFF token without persisting its bearer value.
 * Domain-separated HMAC prevents customer or Better Auth identifiers from
 * revealing the token when D1 is disclosed without the Worker secret.
 */
export async function deriveSiteSessionToken(
  secret: string,
  customerId: string,
  betterAuthUserId: string
): Promise<string> {
  if (secret.length === 0) {
    throw new Error('Site session signing secret is unavailable');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const payload = new TextEncoder().encode(
    `${SITE_SESSION_DOMAIN}\n${customerId}\n${betterAuthUserId}`
  );
  return hex(await crypto.subtle.sign('HMAC', key, payload));
}
