import { Cause, Effect, Exit, Option } from 'effect';
import * as Schema from 'effect/Schema';
import { decodeJsonBody, type InvalidJsonBodyError } from '../body';
import {
  type Env,
  jsonResponse,
  errorResponse,
  generateToken,
  validateSession,
  logAudit,
  verifyTurnstile,
  TurnstileVerificationUnavailable,
  type User,
} from '../api';
import {
  CustomerId,
  SendCodeRequestSchema,
  SessionToken,
  SessionTokenRequestSchema,
  VerifyCodeRequestSchema,
  decodeAuthCodeCountRow,
  decodeAuthCodeRow,
  decodeAuthCustomerRow,
  type AuthCustomerRow,
  type EmailAddress,
  type SendCodeResponse,
  type VerifyCodeResponse,
} from '../contracts/otp-auth';
import { generateOtpCode, hashOtpCode } from '../otp';
import { reportError } from '../observability';
import { casesHandled } from '../prelude';

/** Too many OTP requests were made for this email. */
class AuthRateLimitedError extends Error {
  readonly _tag = 'AuthRateLimitedError';
  constructor() {
    super('Too many requests. Please wait a few minutes.');
  }
}

/** Turnstile verification is required but was not provided. */
class TurnstileRequiredError extends Error {
  readonly _tag = 'TurnstileRequiredError';
  constructor() {
    super('Security verification required');
  }
}

/** Turnstile rejected the token. */
class TurnstileFailedError extends Error {
  readonly _tag = 'TurnstileFailedError';
  constructor() {
    super('Security verification failed. Please try again.');
  }
}

/** Resend is not configured on this Worker. */
class EmailServiceUnconfigured extends Error {
  readonly _tag = 'EmailServiceUnconfigured';
  constructor() {
    super('Email service not configured');
  }
}

/** The OTP email could not be delivered. */
class EmailDeliveryFailed extends Error {
  readonly _tag = 'EmailDeliveryFailed';
  constructor(override readonly cause?: unknown) {
    super('Failed to send email');
  }
}

/** The OTP is missing, used, or expired. */
class InvalidOtpError extends Error {
  readonly _tag = 'InvalidOtpError';
  constructor() {
    super('Invalid or expired code');
  }
}

/** Web Crypto could not create or verify an OTP digest. */
class AuthCryptoUnavailable extends Error {
  readonly _tag = 'AuthCryptoUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Authentication cryptography unavailable');
  }
}

/** D1 was unavailable or returned an unreadable row during OTP auth. */
class AuthStoreUnavailable extends Error {
  readonly _tag = 'AuthStoreUnavailable';
  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`Auth store unavailable during ${operation}`);
  }
}

type SendCodeError =
  | InvalidJsonBodyError
  | AuthRateLimitedError
  | TurnstileRequiredError
  | TurnstileFailedError
  | TurnstileVerificationUnavailable
  | EmailServiceUnconfigured
  | EmailDeliveryFailed
  | AuthCryptoUnavailable
  | AuthStoreUnavailable;

type VerifyCodeError =
  InvalidJsonBodyError | InvalidOtpError | AuthCryptoUnavailable | AuthStoreUnavailable;

type SessionTokenError = InvalidJsonBodyError | AuthStoreUnavailable;

const MAX_OTP_ATTEMPTS = 5;

function digestOtpCode(
  email: EmailAddress,
  code: string,
  secret: string
): Effect.Effect<string, AuthCryptoUnavailable> {
  return Effect.tryPromise({
    try: () => hashOtpCode(email, code, secret),
    catch: cause => new AuthCryptoUnavailable(cause),
  });
}

/** Creates the plaintext OTP delivered to the user. */
type OtpCodeGenerator = () => string;

/** Sends a generated OTP to an email address. */
export type OtpMailer = (
  email: EmailAddress,
  code: string
) => Effect.Effect<void, EmailServiceUnconfigured | EmailDeliveryFailed>;

function brandGeneratedId<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  value: string
): Schema.Schema.Type<S> {
  return Schema.decodeUnknownSync(schema)(value);
}

/**
 * Deliver OTP mail through the Cloudflare Email Sending binding.
 *
 * @param env - Worker bindings with the `EMAIL` send_email binding.
 * @returns An OTP mailer.
 */
function cloudflareMailer(env: Env): OtpMailer {
  return (email, code) => {
    return Effect.tryPromise({
      try: async () => {
        await env.EMAIL.send({
          to: email,
          from: 'OMG <noreply@latham.cloud>',
          subject: 'Your OMG verification code',
          html: otpEmailHtml(code),
          text: `Your OMG verification code is ${code}. It expires in 10 minutes.`,
        });
      },
      catch: cause => new EmailDeliveryFailed(cause),
    });
  };
}

function otpEmailHtml(code: string): string {
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px">',
    '<div style="text-align:center;margin-bottom:30px"><h1 style="color:#1a1a2e;font-size:28px">🚀 OMG</h1><p style="color:#666;margin:5px 0 0">Package Manager</p></div>',
    '<div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;padding:30px;text-align:center">',
    '<p style="color:rgba(255,255,255,.9);margin:0 0 15px;font-size:16px">Your verification code is:</p>',
    `<div style="background:rgba(255,255,255,.95);border-radius:12px;padding:20px;max-width:200px;margin:0 auto"><span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1a1a2e">${code}</span></div>`,
    '<p style="color:rgba(255,255,255,.8);margin:20px 0 0;font-size:14px">This code expires in 10 minutes.</p>',
    '</div><p style="color:#999;font-size:13px;text-align:center;margin-top:30px">If you didn\'t request this code, ignore this email.</p></div>',
  ].join('');
}

function requireTurnstile(
  request: Request,
  env: Env,
  token: string | undefined,
  email: EmailAddress
): Effect.Effect<
  void,
  TurnstileRequiredError | TurnstileFailedError | TurnstileVerificationUnavailable
> {
  if (env.TURNSTILE_SECRET_KEY === undefined || env.TURNSTILE_SECRET_KEY.length === 0) {
    // Fail closed: without a configured Turnstile secret we cannot verify bots.
    return Effect.fail(new TurnstileVerificationUnavailable());
  }
  if (token === undefined || token.length === 0) {
    return Effect.fail(new TurnstileRequiredError());
  }
  const secret = env.TURNSTILE_SECRET_KEY;
  return verifyTurnstile(token, secret, request.headers.get('CF-Connecting-IP')).pipe(
    Effect.flatMap(result => {
      if (result.success) {
        return Effect.void;
      }
      return logAudit(env.DB, null, 'auth.turnstile_failed', 'auth_code', null, request, {
        email,
        error: result.error,
      }).pipe(Effect.zipRight(Effect.fail(new TurnstileFailedError())));
    })
  );
}

/**
 * Send an OTP to a branded email address.
 *
 * @param request - Incoming POST with JSON body.
 * @param env - Worker bindings.
 * @param mailer - Deliver the generated code.
 * @param generateCode - Create the code using the runtime's cryptographic generator.
 * @returns A success payload, or a tagged send-code error.
 */
export function sendVerificationCode(
  request: Request,
  env: Env,
  mailer: OtpMailer,
  generateCode: OtpCodeGenerator
): Effect.Effect<SendCodeResponse, SendCodeError> {
  return Effect.gen(function* () {
    const body = yield* decodeJsonBody(request, SendCodeRequestSchema);
    yield* requireTurnstile(request, env, body.turnstileToken, body.email);
    const recent = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          `SELECT COUNT(*) as count FROM auth_codes
           WHERE email = ? AND created_at > datetime('now', '-10 minutes')`
        )
          .bind(body.email)
          .first(),
      catch: cause => new AuthStoreUnavailable('countRecentCodes', cause),
    }).pipe(
      Effect.flatMap(row => {
        if (row === null) {
          return Effect.succeed({ count: 0 });
        }
        return decodeAuthCodeCountRow(row).pipe(
          Effect.mapError(cause => new AuthStoreUnavailable('countRecentCodes', cause))
        );
      })
    );
    if (recent.count >= 3) {
      yield* Effect.fail(new AuthRateLimitedError());
    }
    const code = generateCode();
    const digest = yield* digestOtpCode(body.email, code, env.JWT_SECRET);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    yield* mailer(body.email, code);
    yield* Effect.tryPromise({
      try: () =>
        env.DB.batch([
          env.DB.prepare(`UPDATE auth_codes SET used = 1 WHERE email = ? AND used = 0`).bind(
            body.email
          ),
          env.DB.prepare(
            `INSERT INTO auth_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)`
          ).bind(crypto.randomUUID(), body.email, digest, expiresAt),
        ]),
      catch: cause => new AuthStoreUnavailable('replaceCode', cause),
    });
    yield* mailer(body.email, code);
    yield* logAudit(env.DB, null, 'auth.code_sent', 'auth_code', null, request, {
      email: body.email,
    });
    return { success: true as const, message: 'Verification code sent' };
  });
}

function findOrCreateCustomer(
  db: D1Database,
  email: EmailAddress,
  request: Request
): Effect.Effect<AuthCustomerRow, AuthStoreUnavailable> {
  return Effect.gen(function* () {
    const existing = yield* Effect.tryPromise({
      try: () =>
        db.prepare(`SELECT id, email, company FROM customers WHERE email = ?`).bind(email).first(),
      catch: cause => new AuthStoreUnavailable('findCustomer', cause),
    }).pipe(
      Effect.flatMap(row => {
        if (row === null) {
          return Effect.succeed(null);
        }
        return decodeAuthCustomerRow(row).pipe(
          Effect.mapError(cause => new AuthStoreUnavailable('findCustomer', cause))
        );
      })
    );
    if (existing !== null) {
      return existing;
    }
    const customerId = brandGeneratedId(CustomerId, crypto.randomUUID());
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'free')`)
          .bind(customerId, email)
          .run(),
      catch: cause => new AuthStoreUnavailable('insertCustomer', cause),
    });
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
             VALUES (?, ?, ?, 'free', 'active', 1)`
          )
          .bind(crypto.randomUUID(), customerId, crypto.randomUUID())
          .run(),
      catch: cause => new AuthStoreUnavailable('insertLicense', cause),
    });
    yield* logAudit(db, customerId, 'user.created', 'customer', customerId, request);
    return { id: customerId, email, company: null };
  });
}

/**
 * Verify an OTP and mint a Worker session.
 *
 * @param request - Incoming POST with JSON body.
 * @param env - Worker bindings.
 * @returns A session payload, or a tagged verify-code error.
 */
function verifyCode(
  request: Request,
  env: Env
): Effect.Effect<VerifyCodeResponse, VerifyCodeError> {
  return Effect.gen(function* () {
    const body = yield* decodeJsonBody(request, VerifyCodeRequestSchema);
    const digest = yield* digestOtpCode(body.email, body.code, env.JWT_SECRET);
    const authCode = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          `UPDATE auth_codes
           SET used = 1
           WHERE id = (
             SELECT id FROM auth_codes
             WHERE email = ? AND code = ? AND used = 0
               AND attempt_count < ? AND expires_at > datetime('now')
             ORDER BY created_at DESC LIMIT 1
           ) AND used = 0
           RETURNING id`
        )
          .bind(body.email, digest, MAX_OTP_ATTEMPTS)
          .first(),
      catch: cause => new AuthStoreUnavailable('claimCode', cause),
    }).pipe(
      Effect.flatMap(row => {
        if (row === null) {
          return Effect.succeed(null);
        }
        return decodeAuthCodeRow(row).pipe(
          Effect.mapError(cause => new AuthStoreUnavailable('claimCode', cause))
        );
      })
    );
    if (authCode === null) {
      // Do NOT increment attempt_count here: doing so lets an attacker who
      // knows the victim's email burn their legitimate code by submitting
      // wrong codes. Brute-force protection is handled by the IP rate limiter.
      yield* logAudit(env.DB, null, 'auth.code_verify_failed', 'auth_code', null, request, {
        email: body.email,
      });
      yield* Effect.fail(new InvalidOtpError());
    }
    yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(`UPDATE auth_codes SET used = 1 WHERE email = ? AND used = 0`)
          .bind(body.email)
          .run(),
      catch: cause => new AuthStoreUnavailable('invalidateCodes', cause),
    });
    const customer = yield* findOrCreateCustomer(env.DB, body.email, request);
    const sessionToken = brandGeneratedId(SessionToken, generateToken());
    const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          `INSERT INTO sessions (id, customer_id, token, ip_address, user_agent, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(
            crypto.randomUUID(),
            customer.id,
            sessionToken,
            request.headers.get('CF-Connecting-IP'),
            request.headers.get('User-Agent'),
            sessionExpires
          )
          .run(),
      catch: cause => new AuthStoreUnavailable('insertSession', cause),
    });
    yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          `DELETE FROM sessions WHERE customer_id = ? AND id NOT IN (
            SELECT id FROM sessions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5
          )`
        )
          .bind(customer.id, customer.id)
          .run(),
      catch: cause => new AuthStoreUnavailable('pruneSessions', cause),
    });
    yield* logAudit(env.DB, customer.id, 'auth.login', 'session', null, request);
    const company = customer.company;
    return {
      success: true as const,
      token: sessionToken,
      expires_at: sessionExpires,
      user: {
        id: customer.id,
        email: customer.email,
        name: company === undefined ? null : company,
      },
    };
  });
}

function verifySessionToken(
  request: Request,
  env: Env
): Effect.Effect<
  | { readonly valid: false }
  | { readonly valid: true; readonly user: User; readonly expires_at: string },
  SessionTokenError
> {
  return Effect.gen(function* () {
    const body = yield* decodeJsonBody(request, SessionTokenRequestSchema);
    const result = yield* Effect.tryPromise({
      try: () => validateSession(env.DB, body.token),
      catch: cause => new AuthStoreUnavailable('validateSession', cause),
    });
    if (result === null) {
      return { valid: false as const };
    }
    return {
      valid: true as const,
      user: result.user,
      expires_at: result.session.expires_at,
    };
  });
}

function httpStatusForSend(error: SendCodeError): number {
  switch (error._tag) {
    case 'InvalidJsonBodyError':
    case 'TurnstileRequiredError':
      return 400;
    case 'TurnstileFailedError':
      return 403;
    case 'AuthRateLimitedError':
      return 429;
    case 'TurnstileVerificationUnavailable':
      return 503;
    case 'EmailServiceUnconfigured':
    case 'EmailDeliveryFailed':
    case 'AuthCryptoUnavailable':
    case 'AuthStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

function httpStatusForVerify(error: VerifyCodeError): number {
  switch (error._tag) {
    case 'InvalidJsonBodyError':
      return 400;
    case 'InvalidOtpError':
      return 401;
    case 'AuthCryptoUnavailable':
    case 'AuthStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

function responseFromSendExit(exit: Exit.Exit<SendCodeResponse, SendCodeError>): Response {
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        return errorResponse(error.message, httpStatusForSend(error));
      }
      return errorResponse('Internal server error', 500);
    },
  });
}

function responseFromVerifyExit(exit: Exit.Exit<VerifyCodeResponse, VerifyCodeError>): Response {
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        return errorResponse(error.message, httpStatusForVerify(error));
      }
      return errorResponse('Verification failed. Please try again.', 500);
    },
  });
}

/**
 * HTTP adapter for `POST /api/auth/send-code`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON success payload or a mapped error response.
 */
export async function handleSendCode(request: Request, env: Env): Promise<Response> {
  if (env.AUTH_RATE_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.AUTH_RATE_LIMITER.limit({ key: `send_code:${ip}` });
    if (!success) {
      return errorResponse('Rate limit exceeded', 429);
    }
  }
  const exit = await Effect.runPromiseExit(
    sendVerificationCode(request, env, cloudflareMailer(env), generateOtpCode)
  );
  return responseFromSendExit(exit);
}

/**
 * HTTP adapter for `POST /api/auth/verify-code`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON session payload or a mapped error response.
 */
export async function handleVerifyCode(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(verifyCode(request, env));
  return responseFromVerifyExit(exit);
}

/**
 * HTTP adapter for `POST /api/auth/verify-session`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns Whether the session token is valid.
 */
export async function handleVerifySession(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(verifySessionToken(request, env));
  return Exit.match(exit, {
    onSuccess: result => {
      if (result.valid === false) {
        return jsonResponse({ valid: false }, 401);
      }
      return jsonResponse({
        valid: true,
        user: result.user,
        expires_at: result.expires_at,
      });
    },
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure) && failure.value._tag === 'InvalidJsonBodyError') {
        return errorResponse('Invalid JSON body', 400);
      }
      return errorResponse('Internal server error', 500);
    },
  });
}

/**
 * HTTP adapter for `POST /api/auth/logout`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns A success payload even when no token was present.
 */
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const OptionalTokenSchema = Schema.Struct({
    token: Schema.optional(SessionToken),
  });
  const exit = await Effect.runPromiseExit(decodeJsonBody(request, OptionalTokenSchema));
  if (Exit.isFailure(exit)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const token = exit.value.token;
  if (token !== undefined) {
    try {
      const result = await validateSession(env.DB, token);
      if (result !== null) {
        await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
        // logAudit is best-effort and cannot fail; failures are logged internally.
        await Effect.runPromise(
          logAudit(env.DB, result.user.id, 'auth.logout', 'session', null, request)
        );
      }
    } catch (error: unknown) {
      reportError('Logout session cleanup failed:', error);
      return errorResponse('Internal server error', 500);
    }
  }
  return jsonResponse({ success: true });
}
