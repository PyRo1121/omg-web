// Authentication handlers
import { runPromise, either } from 'effect/Effect';
import { Struct, String as SchemaString, optional } from '@effect/schema/Schema';
import type { Schema } from '@effect/schema';
import { decodeJsonBody } from '../body';
import {
  type Env,
  jsonResponse,
  errorResponse,
  generateId,
  generateToken,
  generateOTP,
  validateSession,
  logAudit,
  verifyTurnstile,
} from '../api';

/** The send OTP request body. */
const SendCodeRequestSchema = Struct({
  email: optional(SchemaString),
  turnstileToken: optional(SchemaString),
});

/** The verify OTP request body. */
const VerifyCodeRequestSchema = Struct({
  email: optional(SchemaString),
  code: optional(SchemaString),
});

/** The session token request body. */
const SessionTokenRequestSchema = Struct({
  token: optional(SchemaString),
});

/**
 * Decode the request body with the given schema and fail with a 400 response
 * when the body is malformed.
 */
async function decodeBody<S extends Schema.Schema.AnyNoContext>(
  request: Request,
  schema: S
): Promise<Schema.Schema.Type<S> | Response> {
  const result = await runPromise(decodeJsonBody(request, schema).pipe(either));
  return result._tag === 'Left' ? errorResponse('Invalid JSON body', 400) : result.right;
}

// Send OTP email via Resend
async function sendOTPEmail(
  email: string,
  code: string,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'OMG <noreply@pyro1121.com>',
        to: [email],
        subject: 'Your OMG verification code',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a2e; margin: 0; font-size: 28px;">🚀 OMG</h1>
              <p style="color: #666; margin: 5px 0 0;">Package Manager</p>
            </div>
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 30px; text-align: center;">
              <p style="color: rgba(255,255,255,0.9); margin: 0 0 15px; font-size: 16px;">Your verification code is:</p>
              <div style="background: rgba(255,255,255,0.95); border-radius: 12px; padding: 20px; margin: 0 auto; max-width: 200px;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${code}</span>
              </div>
              <p style="color: rgba(255,255,255,0.8); margin: 20px 0 0; font-size: 14px;">This code expires in 10 minutes.</p>
            </div>
            <p style="color: #999; font-size: 13px; text-align: center; margin-top: 30px;">
              If you didn't request this code, you can safely ignore this email.
            </p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      // SAFETY: Resend error responses are expected to contain an optional string message.
      const errorData = (await response.json()) as { message?: string };
      return { success: false, error: errorData.message || 'Email send failed' };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Send OTP code to email
export async function handleSendCode(request: Request, env: Env): Promise<Response> {
  const bodyResult = await decodeBody(request, SendCodeRequestSchema);
  if (bodyResult instanceof Response) return bodyResult;
  const body = bodyResult;
  const email = body.email?.toLowerCase().trim();
  const turnstileToken = body.turnstileToken;

  if (!email || !email.includes('@')) {
    return errorResponse('Valid email required');
  }

  // Verify Turnstile token (bot protection)
  if (env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return errorResponse('Security verification required', 400);
    }

    const ip = request.headers.get('CF-Connecting-IP');
    const turnstileResult = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);

    if (!turnstileResult.success) {
      await logAudit(env.DB, null, 'auth.turnstile_failed', 'auth_code', null, request, {
        email,
        error: turnstileResult.error,
      });
      return errorResponse('Security verification failed. Please try again.', 403);
    }
  }

  // Rate limit: max 3 codes per email per 10 minutes
  const recentCodes = await env.DB.prepare(
    `
    SELECT COUNT(*) as count FROM auth_codes 
    WHERE email = ? AND created_at > datetime('now', '-10 minutes')
  `
  )
    .bind(email)
    .first();

  // SAFETY: COUNT(*) returns a numeric aggregate when a row is present.
  if ((recentCodes?.count as number) >= 3) {
    return errorResponse('Too many requests. Please wait a few minutes.', 429);
  }

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `
    INSERT INTO auth_codes (id, email, code, expires_at)
    VALUES (?, ?, ?, ?)
  `
  )
    .bind(generateId(), email, code, expiresAt)
    .run();

  // Send email
  if (!env.RESEND_API_KEY) {
    return errorResponse('Email service not configured', 500);
  }

  const emailResult = await sendOTPEmail(email, code, env.RESEND_API_KEY);
  if (!emailResult.success) {
    return errorResponse(emailResult.error || 'Failed to send email', 500);
  }

  await logAudit(env.DB, null, 'auth.code_sent', 'auth_code', null, request, { email });

  return jsonResponse({ success: true, message: 'Verification code sent' });
}

// Verify OTP and create session
export async function handleVerifyCode(request: Request, env: Env): Promise<Response> {
  try {
    const bodyResult = await decodeBody(request, VerifyCodeRequestSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const body = bodyResult;
    const email = body.email?.toLowerCase().trim();
    const code = body.code?.trim();

    if (!email || !code) {
      return errorResponse('Email and code required');
    }

    // Find valid code
    const authCode = await env.DB.prepare(
      `
      SELECT * FROM auth_codes 
      WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `
    )
      .bind(email, code)
      .first();

    if (!authCode) {
      await logAudit(env.DB, null, 'auth.code_invalid', 'auth_code', null, request, { email });
      return errorResponse('Invalid or expired code', 401);
    }

    // Mark code as used
    await env.DB.prepare(`UPDATE auth_codes SET used = 1 WHERE id = ?`).bind(authCode.id).run();

    // Find or create customer (using existing schema)
    let customer = await env.DB.prepare(`SELECT * FROM customers WHERE email = ?`)
      .bind(email)
      .first();

    if (!customer) {
      const customerId = generateId();
      await env.DB.prepare(
        `
        INSERT INTO customers (id, email, tier) VALUES (?, ?, 'free')
      `
      )
        .bind(customerId, email)
        .run();

      // Create free license for new customer
      const licenseKey = crypto.randomUUID();
      await env.DB.prepare(
        `
        INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
        VALUES (?, ?, ?, 'free', 'active', 1)
      `
      )
        .bind(generateId(), customerId, licenseKey)
        .run();

      customer = { id: customerId, email };
      await logAudit(env.DB, customerId, 'user.created', 'customer', customerId, request);
    }

    // Create session (30 days)
    const sessionToken = generateToken();
    const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(
      `
      INSERT INTO sessions (id, customer_id, token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
      .bind(
        generateId(),
        customer.id,
        sessionToken,
        request.headers.get('CF-Connecting-IP'),
        request.headers.get('User-Agent'),
        sessionExpires
      )
      .run();

    // Clean up old sessions (keep last 5)
    await env.DB.prepare(
      `
      DELETE FROM sessions WHERE customer_id = ? AND id NOT IN (
        SELECT id FROM sessions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5
      )
    `
    )
      .bind(customer.id, customer.id)
      .run();

    // SAFETY: Existing customers and newly created customers both receive a generated string id.
    await logAudit(env.DB, customer.id as string, 'auth.login', 'session', null, request);

    return jsonResponse({
      success: true,
      token: sessionToken,
      expires_at: sessionExpires,
      user: {
        id: customer.id,
        email: customer.email,
        name: customer.company || null,
      },
    });
  } catch (e) {
    console.error('Verify code error:', e);
    return errorResponse('Verification failed. Please try again.', 500);
  }
}

// Verify session token
export async function handleVerifySession(request: Request, env: Env): Promise<Response> {
  const bodyResult = await decodeBody(request, SessionTokenRequestSchema);
  if (bodyResult instanceof Response) return bodyResult;
  const body = bodyResult;
  const token = body.token;

  if (!token) {
    return errorResponse('Token required');
  }

  const result = await validateSession(env.DB, token);
  if (!result) {
    return jsonResponse({ valid: false }, 401);
  }

  return jsonResponse({
    valid: true,
    user: result.user,
    expires_at: result.session.expires_at,
  });
}

// Logout (invalidate session)
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const bodyResult = await decodeBody(request, SessionTokenRequestSchema);
  if (bodyResult instanceof Response) return bodyResult;
  const body = bodyResult;
  const token = body.token;

  if (token) {
    const result = await validateSession(env.DB, token);
    if (result) {
      await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
      await logAudit(env.DB, result.user.id, 'auth.logout', 'session', null, request);
    }
  }

  return jsonResponse({ success: true });
}
