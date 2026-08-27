// API Types and Utilities for OMG Dashboard
// All authenticated endpoints require a valid session token

import * as Sentry from '@sentry/cloudflare';
import { Cause, Effect, Exit, Option } from 'effect';
import * as Schema from 'effect/Schema';
import {
  ExtraRowParseError,
  readOptionalExtraRow,
  SessionJoinRowSchema,
} from './contracts/d1-extras';
import { TurnstileSiteverifySchema } from './contracts/provider-boundaries';

export interface Env extends Pick<Cloudflare.Env, 'DB'> {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  JWT_SECRET: string;
  JWT_PRIVATE_KEY: string;
  EMAIL: SendEmail;
  ADMIN_USER_ID?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_TEAM_PRICE_ID?: string;
  STRIPE_ENT_PRICE_ID?: string;
  STRIPE_INTRO_COUPON_ID?: string;
  ADMIN_RATE_LIMITER?: RateLimit;
  AUTH_RATE_LIMITER?: RateLimit;
  API_RATE_LIMITER?: RateLimit;
  OFFER_RATE_LIMITER?: RateLimit;
  TURNSTILE_SECRET_KEY?: string;
  SENTRY_DSN?: string;
  ADMIN_API_SECRET?: string;
  SVELTE_BFF_SECRET?: string;
}

// User from database
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

// Session from database
export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
}

// Achievement definitions
export const ACHIEVEMENTS = [
  { id: 'first_command', emoji: '🚀', name: 'First Step', description: 'Run your first command' },
  {
    id: 'centurion',
    emoji: '💯',
    name: 'Centurion',
    description: 'Run 100 commands',
    threshold: 100,
  },
  {
    id: 'power_user',
    emoji: '⚡',
    name: 'Power User',
    description: 'Run 1,000 commands',
    threshold: 1000,
  },
  {
    id: 'legend',
    emoji: '🏆',
    name: 'Legend',
    description: 'Run 10,000 commands',
    threshold: 10000,
  },
  {
    id: 'minute_saver',
    emoji: '⏱️',
    name: 'Minute Saver',
    description: 'Save 1 minute of time',
    threshold: 60000,
  },
  {
    id: 'hour_saver',
    emoji: '⏰',
    name: 'Hour Saver',
    description: 'Save 1 hour of time',
    threshold: 3600000,
  },
  {
    id: 'day_saver',
    emoji: '📅',
    name: 'Day Saver',
    description: 'Save 24 hours of time',
    threshold: 86400000,
  },
  {
    id: 'week_streak',
    emoji: '🔥',
    name: 'Week Streak',
    description: 'Use OMG for 7 days straight',
    threshold: 7,
  },
  {
    id: 'month_streak',
    emoji: '💎',
    name: 'Month Streak',
    description: 'Use OMG for 30 days straight',
    threshold: 30,
  },
  {
    id: 'polyglot',
    emoji: '🌐',
    name: 'Polyglot',
    description: 'Use all 7 built-in runtimes',
    threshold: 7,
  },
  {
    id: 'security_first',
    emoji: '🛡️',
    name: 'Security First',
    description: 'Generate your first SBOM',
  },
  {
    id: 'bug_hunter',
    emoji: '🐛',
    name: 'Bug Hunter',
    description: 'Find and address vulnerabilities',
  },
];

// Tier features
export const TIER_FEATURES = {
  free: {
    max_machines: 1,
    features: ['packages', 'runtimes', 'container', 'env-capture', 'env-share'],
  },
  pro: {
    max_machines: 3,
    features: [
      'packages',
      'runtimes',
      'container',
      'env-capture',
      'env-share',
      'sbom',
      'audit',
      'secrets',
    ],
  },
  team: {
    max_machines: 10,
    features: [
      'packages',
      'runtimes',
      'container',
      'env-capture',
      'env-share',
      'sbom',
      'audit',
      'secrets',
      'fleet',
      'team-sync',
      'team-config',
      'audit-log',
    ],
  },
  enterprise: {
    max_machines: 999,
    features: [
      'packages',
      'runtimes',
      'container',
      'env-capture',
      'env-share',
      'sbom',
      'audit',
      'secrets',
      'fleet',
      'team-sync',
      'team-config',
      'audit-log',
      'policy',
      'slsa',
      'sso',
      'priority-support',
      'enterprise-reports',
      'audit-export',
      'license-scan',
      'compliance',
      'self-hosted',
    ],
  },
};

// CORS headers - Allow the deployed site subdomain
export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://omg.latham.cloud',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Fixed-origin CORS headers (no origin reflection; same-origin requests are the
// primary consumer, so credentials are not granted cross-origin).
export function getCorsHeaders() {
  return { ...corsHeaders };
}

export function jsonResponse<TResponse>(data: TResponse, status = 200): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...corsHeaders,
    'CDN-Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // Every handler routed through here returns authenticated or
    // personalized data. Without an explicit Cache-Control, a 200 would be
    // heuristically cacheable by downstream shared caches (CDN-Cache-Control
    // only binds Cloudflare itself), which web.dev flags as a cache-leak
    // risk for credentialed responses.
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  });
  return new Response(JSON.stringify(data), { status, headers });
}

// Error response helper
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/** Cloudflare's client address, or one shared fail-safe bucket outside the edge. */
export function rateLimitClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** Apply one limiter key; missing or failed bindings reject instead of bypassing limits. */
export async function enforceRateLimit(
  limiter: RateLimit | undefined,
  key: string
): Promise<Response | null> {
  if (limiter === undefined) {
    return errorResponse('Rate limiting unavailable', 503);
  }
  try {
    const result = await limiter.limit({ key });
    return result.success ? null : errorResponse('Rate limit exceeded', 429);
  } catch (error: unknown) {
    Sentry.captureException(error);
    return errorResponse('Rate limiting unavailable', 503);
  }
}

/**
 * Run an Effect-based handler and render its success value as JSON.
 *
 * Typed failures are mapped through `toErrorResponse`; defects (unexpected
 * causes such as thrown errors) render `defectMessage` with status 500.
 *
 * @param effect - The handler effect whose success value is the JSON body.
 * @param toErrorResponse - Maps a typed failure to its HTTP response.
 * @param defectMessage - Body used for non-failure (defect) causes.
 * @returns The rendered HTTP response.
 */
export async function respondFromEffect<E>(
  effect: Effect.Effect<unknown, E>,
  toErrorResponse: (error: E) => Response,
  defectMessage = 'Internal server error'
): Promise<Response> {
  const exit = await Effect.runPromiseExit(effect);
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      return Option.isSome(failure)
        ? toErrorResponse(failure.value)
        : errorResponse(defectMessage, 500);
    },
  });
}

// Generate secure token
export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export async function validateSession(
  db: D1Database,
  token: string
): Promise<{ user: User; session: Session } | null> {
  const row = await db
    .prepare(
      `
    SELECT s.id, s.token, s.expires_at,
           c.id as customer_id, c.email, c.company, c.stripe_customer_id, c.created_at as customer_created_at
    FROM sessions s
    JOIN customers c ON s.customer_id = c.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `
    )
    .bind(token)
    .first();

  const decodedSession = await readOptionalExtraRow(
    SessionJoinRowSchema,
    'Session join row has an invalid shape',
    row
  );
  if (decodedSession._tag === 'invalid') {
    throw new ExtraRowParseError('Session join row has an invalid shape');
  }
  if (decodedSession._tag === 'missing') {
    return null;
  }
  const session = decodedSession.value;

  return {
    user: {
      id: session.customer_id,
      email: session.email,
      name: session.company ?? null,
      avatar_url: null,
      stripe_customer_id: session.stripe_customer_id ?? null,
      created_at: session.customer_created_at,
    },
    session: {
      id: session.id,
      user_id: session.customer_id,
      token: session.token,
      expires_at: session.expires_at,
    },
  };
}

// Get authorization token from request
export function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/** A best-effort audit write failed after the primary operation completed. */
class AuditLogWriteError extends Error {
  readonly _tag = 'AuditLogWriteError';
  constructor(override readonly cause?: unknown) {
    super('Audit log write failed');
  }
}

/**
 * Record an audit event without making the primary operation depend on observability storage.
 * Privacy deletion receipts use their own atomic transaction and do not use this helper.
 */
export function logAudit<TMetadata extends object>(
  db: D1Database,
  customerId: string | null | undefined,
  action: string,
  resourceType?: string | null,
  resourceId?: string | null,
  request?: Request,
  metadata?: TMetadata
): Effect.Effect<void> {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `
      INSERT INTO audit_log (id, customer_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
        )
        .bind(
          crypto.randomUUID(),
          customerId ?? null,
          action,
          resourceType ?? null,
          resourceId ?? null,
          request?.headers.get('CF-Connecting-IP') ?? null,
          request?.headers.get('User-Agent') ?? null,
          metadata ? JSON.stringify(metadata) : null
        )
        .run(),
    catch: cause => new AuditLogWriteError(cause),
  }).pipe(
    Effect.asVoid,
    Effect.catchAll(error =>
      Effect.sync(() => Sentry.captureException(error)).pipe(
        Effect.zipRight(Effect.logError('Best-effort audit write failed', error))
      )
    )
  );
}

/** Cloudflare Turnstile could not be reached or returned an invalid payload. */
export class TurnstileVerificationUnavailable extends Error {
  readonly _tag = 'TurnstileVerificationUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Security verification service unavailable');
  }
}

/** Fetch seam for provider-boundary behavior tests. */
export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

/** Verify a token at Cloudflare's Siteverify boundary and decode its response. */
export function verifyTurnstile(
  token: string,
  secretKey: string,
  ip?: string | null,
  providerFetch: ProviderFetch = fetch
): Effect.Effect<
  { readonly success: true } | { readonly success: false; readonly error: string },
  TurnstileVerificationUnavailable
> {
  const formData = new URLSearchParams({ secret: secretKey, response: token });
  if (ip) {
    formData.append('remoteip', ip);
  }

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        providerFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData,
        }),
      catch: cause => new TurnstileVerificationUnavailable(cause),
    });
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause => new TurnstileVerificationUnavailable(cause),
    });
    const result = yield* Schema.decodeUnknown(TurnstileSiteverifySchema)(payload).pipe(
      Effect.mapError(cause => new TurnstileVerificationUnavailable(cause))
    );

    if (!result.success) {
      return {
        success: false as const,
        error: result['error-codes']?.join(', ') ?? 'Verification failed',
      };
    }
    return { success: true as const };
  });
}
