const OTP_DIGITS = 6;
const OTP_MINIMUM = 10 ** (OTP_DIGITS - 1);
const OTP_POSSIBILITIES = 9 * OTP_MINIMUM;
const UINT32_RANGE = 2 ** 32;
const UNBIASED_LIMIT = Math.floor(UINT32_RANGE / OTP_POSSIBILITIES) * OTP_POSSIBILITIES;
const OTP_DIGEST_PREFIX = 'hmac-sha256:v1:';
const OTP_HMAC_CONTEXT = 'omg-web:otp:v1';

/** Generate a uniformly distributed six-digit code with the Workers Web Crypto API. */
export function generateOtpCode(): string {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  let value = UNBIASED_LIMIT;

  while (value >= UNBIASED_LIMIT) {
    crypto.getRandomValues(bytes);
    value = view.getUint32(0);
  }

  return (OTP_MINIMUM + (value % OTP_POSSIBILITIES)).toString();
}

/** Create a domain-separated keyed digest suitable for OTP persistence and lookup. */
export async function hashOtpCode(email: string, code: string, secret: string): Promise<string> {
  if (secret.length === 0) {
    throw new Error('JWT_SECRET must not be empty');
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${OTP_HMAC_CONTEXT}\u0000${email}\u0000${code}`)
  );
  const digest = Array.from(new Uint8Array(signature), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');

  return `${OTP_DIGEST_PREFIX}${digest}`;
}
