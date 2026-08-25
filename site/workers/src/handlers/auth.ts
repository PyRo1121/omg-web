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
  decodeAuthCodeRow,
  decodeAuthCustomerRow,
  type AuthCodeRow,
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

/** The auth rate limiter binding is missing or failed; throttling is impossible. */
class AuthRateLimiterUnavailable extends Error {
  readonly _tag = 'AuthRateLimiterUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Authentication is temporarily unavailable');
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
  | EmailDeliveryFailed
  | AuthCryptoUnavailable
  | AuthStoreUnavailable;

type VerifyCodeError =
  | InvalidJsonBodyError
  | InvalidOtpError
  | AuthRateLimitedError
  | AuthRateLimiterUnavailable
  | AuthCryptoUnavailable
  | AuthStoreUnavailable;

type SessionTokenError = InvalidJsonBodyError | AuthStoreUnavailable;

const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_CUSTOMER = 5;
/** Audit metadata carries attacker-supplied emails; bound their size. */
const AUDIT_EMAIL_MAX_LENGTH = 320;

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

/** SHA-256 hex of a normalized email: lets the limiter key per account without storing addresses. */
function hashEmailForLimiting(email: EmailAddress): Effect.Effect<string, AuthCryptoUnavailable> {
  return Effect.tryPromise(async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }).pipe(Effect.mapError(cause => new AuthCryptoUnavailable(cause)));
}

/** Run one limiter bucket check; failure of the binding itself fails closed. */
function checkRateLimitBucket(
  limiter: NonNullable<Env['AUTH_RATE_LIMITER']>,
  key: string
): Effect.Effect<boolean, AuthRateLimiterUnavailable> {
  return Effect.tryPromise({
    try: () => limiter.limit({ key }),
    catch: cause => new AuthRateLimiterUnavailable(cause),
  }).pipe(Effect.map(result => result.success));
}

/** Sends a generated OTP to an email address. */
type OtpMailer = (email: EmailAddress, code: string) => Effect.Effect<void, EmailDeliveryFailed>;

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
  return (email, code) =>
    Effect.tryPromise({
      try: () =>
        env.EMAIL.send({
          to: email,
          from: 'OMG <noreply@latham.cloud>',
          subject: 'Your OMG verification code',
          html: otpEmailHtml(code),
          text: `Your OMG verification code is ${code}. It expires in 10 minutes.`,
        }),
      catch: cause => new EmailDeliveryFailed(cause),
    });
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
        email: email.slice(0, AUDIT_EMAIL_MAX_LENGTH),
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
  generateCode: () => string
): Effect.Effect<SendCodeResponse, SendCodeError> {
  return Effect.gen(function* () {
    const body = yield* decodeJsonBody(request, SendCodeRequestSchema);
    yield* requireTurnstile(request, env, body.turnstileToken, body.email);
    const code = generateCode();
    const digest = yield* digestOtpCode(body.email, code, env.JWT_SECRET);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    // Atomic per-email cap: the conditional INSERT ... SELECT admits a new code
    // only when fewer than 3 codes exist for the email in the window, so
    // concurrent requests cannot both pass a count-then-insert race. The
    // RETURNING row is the insertion receipt; an empty result means the cap
    // was hit and no email is sent. The expired-code sweep piggybacks here
    // because no scheduled job covers this table.
    const batchResults = yield* Effect.tryPromise({
      try: () =>
        env.DB.batch([
          env.DB.prepare(`DELETE FROM auth_codes WHERE expires_at <= datetime('now')`),
          env.DB.prepare(`UPDATE auth_codes SET used = 1 WHERE email = ? AND used = 0`).bind(
            body.email
          ),
          env.DB.prepare(
            `INSERT INTO auth_codes (id, email, code, expires_at)
             SELECT ?, ?, ?, ?
             WHERE
               (SELECT COUNT(*) FROM auth_codes
                WHERE email = ? AND created_at > datetime('now', '-10 minutes')) < 3
             RETURNING id`
          ).bind(crypto.randomUUID(), body.email, digest, expiresAt, body.email),
        ]),
      catch: cause => new AuthStoreUnavailable('replaceCode', cause),
    });
    const insertedRows = batchResults[2]?.results ?? [];
    if (insertedRows.length === 0) {
      yield* Effect.fail(new AuthRateLimitedError());
    }
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
      Effect.flatMap(row =>
        row === null
          ? Effect.succeed(null)
          : decodeAuthCustomerRow(row).pipe(
              Effect.mapError(cause => new AuthStoreUnavailable('findCustomer', cause))
            )
      )
    );
    if (existing !== null) {
      return existing;
    }
    // Unique constraint on email + ON CONFLICT DO NOTHING closes the
    // find-then-insert race; miniflare/D1 .run() meta may not carry `changes`,
    // so adoption is detected by re-selecting, never by meta.
    const customerId = brandGeneratedId(CustomerId, crypto.randomUUID());
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `INSERT INTO customers (id, email, tier) VALUES (?, ?, 'free')
             ON CONFLICT (email) DO NOTHING`
          )
          .bind(customerId, email)
          .run(),
      catch: cause => new AuthStoreUnavailable('insertCustomer', cause),
    });
    const adoptedRow = yield* Effect.tryPromise({
      try: () =>
        db.prepare(`SELECT id, email, company FROM customers WHERE email = ?`).bind(email).first(),
      catch: cause => new AuthStoreUnavailable('findCustomer', cause),
    }).pipe(
      Effect.flatMap(row =>
        row === null
          ? Effect.fail(new AuthStoreUnavailable('findCustomer'))
          : decodeAuthCustomerRow(row).pipe(
              Effect.mapError(cause => new AuthStoreUnavailable('findCustomer', cause))
            )
      )
    );
    // Provision the free license only when the customer has none yet: the
    // race loser adopts the winner's customer, which already owns one.
    const licenseRow = yield* Effect.tryPromise({
      try: () =>
        db.prepare(`SELECT id FROM licenses WHERE customer_id = ?`).bind(adoptedRow.id).first(),
      catch: cause => new AuthStoreUnavailable('findLicenseByCustomer', cause),
    });
    if (licenseRow === null) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare(
              `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
               VALUES (?, ?, ?, 'free', 'active', 1)`
            )
            .bind(crypto.randomUUID(), adoptedRow.id, crypto.randomUUID())
            .run(),
        catch: cause => new AuthStoreUnavailable('insertLicense', cause),
      });
      yield* logAudit(db, adoptedRow.id, 'user.created', 'customer', adoptedRow.id, request);
    }
    return adoptedRow;
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
    yield* Effect.tryPromise({
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
      Effect.flatMap((row): Effect.Effect<AuthCodeRow, VerifyCodeError> => {
        if (row !== null) {
          return decodeAuthCodeRow(row).pipe(
            Effect.mapError(cause => new AuthStoreUnavailable('claimCode', cause))
          );
        }
        // A correct code must remain usable even if an attacker has exhausted
        // the victim's per-email failure bucket. Only failed guesses consume
        // that bucket; the adapter's per-IP limiter still runs before this
        // database lookup, while the hashed email bucket bounds distributed
        // invalid guesses without storing an address.
        return Effect.gen(function* () {
          if (env.AUTH_RATE_LIMITER === undefined) {
            return yield* Effect.fail(new AuthRateLimiterUnavailable());
          }
          const emailKey = yield* hashEmailForLimiting(body.email);
          const emailAllowed = yield* checkRateLimitBucket(
            env.AUTH_RATE_LIMITER,
            `verify_code_email:${emailKey}`
          );
          if (!emailAllowed) {
            return yield* Effect.fail(new AuthRateLimitedError());
          }
          return yield* logAudit(
            env.DB,
            null,
            'auth.code_verify_failed',
            'auth_code',
            null,
            request,
            { email: body.email.slice(0, AUDIT_EMAIL_MAX_LENGTH) }
          ).pipe(Effect.zipRight(Effect.fail(new InvalidOtpError())));
        });
      })
    );
    yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(`UPDATE auth_codes SET used = 1 WHERE email = ? AND used = 0`)
          .bind(body.email)
          .run(),
      catch: cause => new AuthStoreUnavailable('invalidateCodes', cause),
    });
    const customer = yield* findOrCreateCustomer(env.DB, body.email, request);
    const sessionToken = brandGeneratedId(SessionToken, generateToken());
    const sessionExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
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
            SELECT id FROM sessions WHERE customer_id = ? ORDER BY created_at DESC LIMIT ${MAX_SESSIONS_PER_CUSTOMER}
          )`
        )
          .bind(customer.id, customer.id)
          .run(),
      catch: cause => new AuthStoreUnavailable('pruneSessions', cause),
    });
    yield* logAudit(env.DB, customer.id, 'auth.login', 'session', null, request);
    return {
      success: true as const,
      token: sessionToken,
      expires_at: sessionExpires,
      user: {
        id: customer.id,
        email: customer.email,
        name: customer.company ?? null,
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
    case 'AuthRateLimitedError':
      return 429;
    case 'AuthRateLimiterUnavailable':
      return 503;
    case 'AuthCryptoUnavailable':
    case 'AuthStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

function responseFromExit<A, E extends Error>(
  exit: Exit.Exit<A, E>,
  httpStatus: (error: E) => number,
  defectMessage: string,
  mapSuccess?: (payload: A) => Response
): Response {
  return Exit.match(exit, {
    onSuccess: payload => (mapSuccess ? mapSuccess(payload) : jsonResponse(payload)),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isNone(failure)) {
        return errorResponse(defectMessage, 500);
      }
      return errorResponse(failure.value.message, httpStatus(failure.value));
    },
  });
}

/** Per-IP throttle shared by every public auth endpoint; missing binding fails closed. */
export async function enforceIpRateLimit(
  request: Request,
  env: Env,
  scope: string
): Promise<Response | null> {
  if (env.AUTH_RATE_LIMITER === undefined) {
    // Fail closed: without the binding there is no brute-force defense at all.
    reportError('AUTH_RATE_LIMITER binding is missing; failing auth request closed');
    return errorResponse('Authentication is temporarily unavailable', 503);
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.AUTH_RATE_LIMITER.limit({ key: `${scope}:${ip}` });
  return success ? null : errorResponse('Rate limit exceeded', 429);
}

/**
 * HTTP adapter for `POST /api/auth/send-code`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON success payload or a mapped error response.
 */
export async function handleSendCode(request: Request, env: Env): Promise<Response> {
  const limited = await enforceIpRateLimit(request, env, 'send_code');
  if (limited !== null) {
    return limited;
  }
  const exit = await Effect.runPromiseExit(
    sendVerificationCode(request, env, cloudflareMailer(env), generateOtpCode)
  );
  return responseFromExit(exit, httpStatusForSend, 'Internal server error');
}

/**
 * HTTP adapter for `POST /api/auth/verify-code`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON session payload or a mapped error response.
 */
export async function handleVerifyCode(request: Request, env: Env): Promise<Response> {
  // Throttle per-IP; verifyCode adds the privacy-safe per-email hashed bucket.
  const limited = await enforceIpRateLimit(request, env, 'verify_code');
  if (limited !== null) {
    return limited;
  }
  const exit = await Effect.runPromiseExit(verifyCode(request, env));
  return responseFromExit(exit, httpStatusForVerify, 'Verification failed. Please try again.');
}

function httpStatusForSessionToken(error: SessionTokenError): number {
  switch (error._tag) {
    case 'InvalidJsonBodyError':
      return 400;
    case 'AuthStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

/**
 * HTTP adapter for `POST /api/auth/verify-session`.
 *
 * @param request - Incoming POST with JSON body.
 * @param env - Worker bindings.
 * @returns Whether the session token is valid.
 */
export async function handleVerifySession(request: Request, env: Env): Promise<Response> {
  // Unauthenticated D1 read: throttled so token probing cannot amplify cost.
  const limited = await enforceIpRateLimit(request, env, 'verify_session');
  if (limited !== null) {
    return limited;
  }
  const exit = await Effect.runPromiseExit(verifySessionToken(request, env));
  return responseFromExit(exit, httpStatusForSessionToken, 'Internal server error', result =>
    result.valid === false
      ? jsonResponse({ valid: false }, 401)
      : jsonResponse({
          valid: true,
          user: result.user,
          expires_at: result.expires_at,
        })
  );
}

/**
 * HTTP adapter for `POST /api/auth/logout`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns A success payload even when no token was present.
 */
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const limited = await enforceIpRateLimit(request, env, 'logout');
  if (limited !== null) {
    return limited;
  }
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
