// API Types and Utilities for OMG Dashboard
// All authenticated endpoints require a valid session token

import { Effect } from 'effect';
import { decodeOptionalExtraRow, SessionJoinRowSchema } from './contracts/d1-extras';

// Rate limiter interface from Cloudflare Workers
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Workers AI binding used by smart insights. The result is Schema-decoded at the call site. */
export interface WorkersAiBinding {
  run(
    model: string,
    input: {
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
      readonly max_tokens: number;
    }
  ): Promise<{ readonly response?: string }>;
}

export interface Env {
  DB: D1Database;
  ANALYTICS_DB: D1Database;
  ASSETS: R2Bucket;
  AI: WorkersAiBinding;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  JWT_PRIVATE_KEY?: string;
  ADMIN_USER_ID?: string;
  STRIPE_TEAM_PRICE_ID?: string;
  STRIPE_ENT_PRICE_ID?: string;
  META_API_KEY?: string;
  ACCOUNT_ID?: string;
  ADMIN_RATE_LIMITER?: RateLimit;
  AUTH_RATE_LIMITER?: RateLimit;
  API_RATE_LIMITER?: RateLimit;
  TURNSTILE_SECRET_KEY?: string;
  SENTRY_DSN?: string;
  ADMIN_API_SECRET?: string;
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

// License from database
export interface License {
  id: string;
  user_id: string;
  license_key: string;
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled' | 'expired';
  max_machines: number;
  expires_at: string | null;
  created_at: string;
}

// Machine from database
export interface Machine {
  id: string;
  license_id: string;
  machine_id: string;
  hostname: string | null;
  os: string | null;
  arch: string | null;
  omg_version: string | null;
  last_seen_at: string;
  first_seen_at: string;
  is_active: number;
}

// Usage stats
export interface UsageStats {
  commands_run: number;
  packages_installed: number;
  packages_searched: number;
  runtimes_switched: number;
  sbom_generated: number;
  vulnerabilities_found: number;
  time_saved_ms: number;
}

// Session from database
export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
}

// Achievement definition
export interface Achievement {
  id: string;
  emoji: string;
  name: string;
  description: string;
  threshold?: number;
}

export const ACHIEVEMENTS: Achievement[] = [
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
      'team-sync',
      'team-config',
      'audit-log',
      'policy',
      'slsa',
      'sso',
      'priority-support',
    ],
  },
};

// CORS headers - Allow main site and docs site
interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://pyro1121.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Helper to get origin-specific CORS headers (for authenticated endpoints)
export function getCorsHeaders(origin: string | null) {
  const allowedOrigins = [
    'https://pyro1121.com',
    'https://omg-docs.pages.dev',
    'https://*.omg-docs.pages.dev',
  ];

  const isAllowed =
    origin &&
    allowedOrigins.some(allowed =>
      allowed.includes('*')
        ? origin.endsWith(allowed.replace('https://*.', '.'))
        : origin === allowed
    );

  const allowedOrigin = isAllowed && origin ? origin : 'https://pyro1121.com';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function jsonResponse<TResponse>(data: TResponse, status = 200): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...corsHeaders,
    'CDN-Cache-Control': 'no-store',
  });
  if (status >= 400) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

// Error response helper
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Generate UUID
export function generateId(): string {
  return crypto.randomUUID();
}

// Generate secure token
export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Generate 6-digit OTP
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

  const session = await Effect.runPromise(
    decodeOptionalExtraRow(SessionJoinRowSchema, 'Session join row has an invalid shape', row)
  );
  if (session === undefined) {
    return null;
  }

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

// Audit log helper
export async function logAudit<TMetadata extends object>(
  db: D1Database,
  customerId: string | null | undefined,
  action: string,
  resourceType?: string | null,
  resourceId?: string | null,
  request?: Request,
  metadata?: TMetadata
): Promise<void> {
  try {
    await db
      .prepare(
        `
      INSERT INTO audit_log (id, customer_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        generateId(),
        customerId ?? null,
        action,
        resourceType ?? null,
        resourceId ?? null,
        request?.headers.get('CF-Connecting-IP') ?? null,
        request?.headers.get('User-Agent') ?? null,
        metadata ? JSON.stringify(metadata) : null
      )
      .run();
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// Verify Cloudflare Turnstile token
export async function verifyTurnstile(
  token: string,
  secretKey: string,
  ip?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    const result = await response.json<TurnstileResponse>();

    if (!result.success) {
      return {
        success: false,
        error: result['error-codes']?.join(', ') || 'Verification failed',
      };
    }

    return { success: true };
  } catch (e) {
    console.error('Turnstile verification error:', e);
    return { success: false, error: 'Verification service unavailable' };
  }
}

// Helper to send emails via Resend
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'OMG <noreply@pyro1121.com>',
        to,
        subject,
        html,
      }),
    });

    return response.ok;
  } catch (e) {
    console.error('Email send error:', e);
    return false;
  }
}
