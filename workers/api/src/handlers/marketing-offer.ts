import { Cause, Effect, Exit, Option } from 'effect';
import * as Schema from 'effect/Schema';
import { type Env, enforceRateLimit, errorResponse, jsonResponse, rateLimitClientIp } from '../api';
import { AdminUnauthorizedError, requireInternalSecret } from '../admin-secret';
import { decodeBoundedJsonResponse, decodeJsonBody, type InvalidJsonBodyError } from '../body';
import { reportError, reportInfo } from '../observability';
import {
  MarketingOfferRequestSchema,
  type MarketingOfferResponse,
} from '../../../../shared/marketing-offer';
import { decodeStripeJson, type StripeParseError } from '../contracts/stripe';

const OFFER_PERCENT = 20 as const;
const OFFER_MONTHS = 3 as const;
const OFFER_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_STRIPE_PROMOTION_RESPONSE_BYTES = 64 * 1024;
const PROMOTION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MarketingOfferRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  status: Schema.Literal('creating', 'ready', 'failed'),
  promotion_code: Schema.Union(Schema.String, Schema.Null),
  expires_at: Schema.Union(Schema.String, Schema.Null),
});

type MarketingOfferRow = Schema.Schema.Type<typeof MarketingOfferRowSchema>;

const ClaimedRowSchema = Schema.Struct({ id: Schema.String.pipe(Schema.minLength(1)) });

const StripePromotionCodeSchema = Schema.Struct({
  id: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  code: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  active: Schema.optional(Schema.Boolean),
  error: Schema.optional(Schema.Struct({ message: Schema.String })),
});

class OfferConfigurationUnavailable extends Error {
  readonly _tag = 'OfferConfigurationUnavailable';
  constructor() {
    super('Introductory offer is unavailable');
  }
}

class OfferRateLimited extends Error {
  readonly _tag = 'OfferRateLimited';
  constructor() {
    super('Too many offer requests');
  }
}

class OfferClaimBusy extends Error {
  readonly _tag = 'OfferClaimBusy';
  constructor() {
    super('Offer generation is already in progress');
  }
}

class OfferStoreUnavailable extends Error {
  readonly _tag = 'OfferStoreUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Offer store is unavailable');
  }
}

class OfferGenerationUnavailable extends Error {
  readonly _tag = 'OfferGenerationUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Offer generation is unavailable');
  }
}

class StripeOfferUnavailable extends Error {
  readonly _tag = 'StripeOfferUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Stripe promotion creation failed');
  }
}

type MarketingOfferError =
  | AdminUnauthorizedError
  | InvalidJsonBodyError
  | OfferConfigurationUnavailable
  | OfferRateLimited
  | OfferClaimBusy
  | OfferStoreUnavailable
  | OfferGenerationUnavailable
  | StripeOfferUnavailable
  | StripeParseError;

function storeOperation<A>(run: () => Promise<A>): Effect.Effect<A, OfferStoreUnavailable> {
  return Effect.tryPromise({ try: run, catch: cause => new OfferStoreUnavailable(cause) });
}

async function codeForLead(leadId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`omg-intro:${leadId}`))
  );
  let suffix = '';
  for (const byte of digest.slice(0, 8)) {
    suffix += PROMOTION_ALPHABET[byte % PROMOTION_ALPHABET.length];
  }
  return `OMG20-${suffix}`;
}

function responseFromRow(row: MarketingOfferRow): MarketingOfferResponse | null {
  if (
    row.status !== 'ready' ||
    row.promotion_code === null ||
    row.expires_at === null ||
    Date.parse(row.expires_at) <= Date.now()
  ) {
    return null;
  }
  return {
    code: row.promotion_code,
    percentOff: OFFER_PERCENT,
    durationMonths: OFFER_MONTHS,
    expiresAt: row.expires_at,
  };
}

function createStripePromotion(
  apiKey: string,
  couponId: string,
  leadId: string,
  code: string,
  expiresAtSeconds: number,
  stripeFetch: typeof fetch
): Effect.Effect<
  { readonly id: string; readonly code: string },
  StripeOfferUnavailable | StripeParseError
> {
  const body = new URLSearchParams({
    'promotion[type]': 'coupon',
    'promotion[coupon]': couponId,
    code,
    max_redemptions: '1',
    expires_at: String(expiresAtSeconds),
    'restrictions[first_time_transaction]': 'true',
    'metadata[lead_id]': leadId,
  });
  return Effect.tryPromise({
    try: async () => {
      const response = await stripeFetch('https://api.stripe.com/v1/promotion_codes', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `marketing-offer:${leadId}`,
          'Stripe-Version': '2026-07-29.dahlia',
        },
        body,
      });
      return Effect.runPromise(
        decodeBoundedJsonResponse(response, MAX_STRIPE_PROMOTION_RESPONSE_BYTES)
      );
    },
    catch: cause => new StripeOfferUnavailable(cause),
  }).pipe(
    Effect.flatMap(payload =>
      decodeStripeJson(
        StripePromotionCodeSchema,
        'Stripe promotion code has an invalid shape',
        payload
      )
    ),
    Effect.flatMap(promotion =>
      promotion.error !== undefined ||
      promotion.id === undefined ||
      promotion.code === undefined ||
      promotion.active !== true
        ? Effect.fail(new StripeOfferUnavailable(promotion.error?.message))
        : Effect.succeed({ id: promotion.id, code: promotion.code })
    )
  );
}

function claimOffer(
  request: Request,
  env: Env,
  stripeFetch: typeof fetch
): Effect.Effect<MarketingOfferResponse, MarketingOfferError> {
  return Effect.gen(function* () {
    yield* requireInternalSecret(request.headers.get('X-Admin-Secret'), [
      env.ADMIN_API_SECRET,
      env.SVELTE_BFF_SECRET,
    ]);
    if (request.headers.get('X-Internal-Call') !== 'service-binding') {
      return yield* Effect.fail(new AdminUnauthorizedError());
    }
    const couponId = env.STRIPE_INTRO_COUPON_ID;
    const rateLimiter = env.OFFER_RATE_LIMITER;
    if (
      env.STRIPE_SECRET_KEY.length === 0 ||
      couponId === undefined ||
      couponId.length === 0 ||
      rateLimiter === undefined
    ) {
      return yield* Effect.fail(new OfferConfigurationUnavailable());
    }

    const visitorIp = request.headers.get('X-Offer-Visitor-IP') ?? 'unknown';
    const limit = yield* Effect.tryPromise({
      try: () => rateLimiter.limit({ key: `marketing_offer:${visitorIp}` }),
      catch: cause => new OfferStoreUnavailable(cause),
    });
    if (!limit.success) return yield* Effect.fail(new OfferRateLimited());

    const body = yield* decodeJsonBody(request, MarketingOfferRequestSchema);
    const email = body.email.toLowerCase();
    const leadId = crypto.randomUUID();
    const claimToken = crypto.randomUUID();

    const inserted = yield* storeOperation(() =>
      env.DB.prepare(
        `INSERT INTO marketing_offer_leads (id, email, status, claim_token)
         VALUES (?, ?, 'creating', ?)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`
      )
        .bind(leadId, email, claimToken)
        .first()
    );
    let claimedLeadId: string | null = null;
    if (inserted !== null) {
      const decoded = yield* Schema.decodeUnknown(ClaimedRowSchema)(inserted).pipe(
        Effect.mapError(cause => new OfferStoreUnavailable(cause))
      );
      claimedLeadId = decoded.id;
    } else {
      const existingValue = yield* storeOperation(() =>
        env.DB.prepare(
          `SELECT id, status, promotion_code, expires_at
           FROM marketing_offer_leads WHERE email = ?`
        )
          .bind(email)
          .first()
      );
      if (existingValue === null) return yield* Effect.fail(new OfferStoreUnavailable());
      const existing = yield* Schema.decodeUnknown(MarketingOfferRowSchema)(existingValue).pipe(
        Effect.mapError(cause => new OfferStoreUnavailable(cause))
      );
      const ready = responseFromRow(existing);
      if (ready !== null) return ready;

      const reclaimed = yield* storeOperation(() =>
        env.DB.prepare(
          `UPDATE marketing_offer_leads
           SET id = CASE WHEN status = 'ready' THEN ? ELSE id END,
               status = 'creating', claim_token = ?, updated_at = CURRENT_TIMESTAMP,
               stripe_promotion_code_id = NULL, promotion_code = NULL,
               expires_at = NULL, last_error = NULL
           WHERE id = ? AND (
             status = 'failed' OR
             (status = 'creating' AND updated_at < datetime('now', '-5 minutes')) OR
             (status = 'ready' AND datetime(expires_at) <= CURRENT_TIMESTAMP)
           )
           RETURNING id`
        )
          .bind(leadId, claimToken, existing.id)
          .first()
      );
      if (reclaimed === null) return yield* Effect.fail(new OfferClaimBusy());
      const decoded = yield* Schema.decodeUnknown(ClaimedRowSchema)(reclaimed).pipe(
        Effect.mapError(cause => new OfferStoreUnavailable(cause))
      );
      claimedLeadId = decoded.id;
    }

    if (claimedLeadId === null) return yield* Effect.fail(new OfferStoreUnavailable());

    const code = yield* Effect.tryPromise({
      try: () => codeForLead(claimedLeadId),
      catch: cause => new OfferGenerationUnavailable(cause),
    });
    const expiresAtSeconds = Math.floor((Date.now() + OFFER_LIFETIME_MS) / 1000);
    const expiresAt = new Date(expiresAtSeconds * 1000);
    const promotionExit = yield* Effect.exit(
      createStripePromotion(
        env.STRIPE_SECRET_KEY,
        couponId,
        claimedLeadId,
        code,
        expiresAtSeconds,
        stripeFetch
      )
    );
    if (Exit.isFailure(promotionExit)) {
      const promotionFailure = Cause.failureOption(promotionExit.cause);
      const lastError =
        Option.isSome(promotionFailure) && promotionFailure.value._tag === 'StripeParseError'
          ? 'stripe response invalid'
          : 'stripe unavailable';
      yield* storeOperation(() =>
        env.DB.prepare(
          `UPDATE marketing_offer_leads
           SET status = 'failed', claim_token = NULL, updated_at = CURRENT_TIMESTAMP,
               last_error = ?
           WHERE id = ? AND claim_token = ?`
        )
          .bind(lastError, claimedLeadId, claimToken)
          .run()
      );
      return yield* Option.isSome(promotionFailure)
        ? Effect.fail(promotionFailure.value)
        : Effect.fail(new StripeOfferUnavailable(promotionExit.cause));
    }

    const promotion = promotionExit.value;
    const updated = yield* storeOperation(() =>
      env.DB.prepare(
        `UPDATE marketing_offer_leads
         SET status = 'ready', claim_token = NULL, stripe_promotion_code_id = ?,
             promotion_code = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND claim_token = ?
         RETURNING id`
      )
        .bind(promotion.id, promotion.code, expiresAt.toISOString(), claimedLeadId, claimToken)
        .first()
    );
    if (updated === null) return yield* Effect.fail(new OfferStoreUnavailable());

    return {
      code: promotion.code,
      percentOff: OFFER_PERCENT,
      durationMonths: OFFER_MONTHS,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

/** Remove expired lead records after the documented 12-month retention window. */
export async function cleanupMarketingOfferLeads(db: D1Database): Promise<void> {
  await db
    .prepare(`DELETE FROM marketing_offer_leads WHERE created_at < datetime('now', '-12 months')`)
    .run();
  reportInfo('Cleaned up expired marketing offer leads');
}

/** Issue or reuse one email-scoped introductory promotion code. */
export async function handleMarketingOffer(
  request: Request,
  env: Env,
  stripeFetch: typeof fetch = fetch
): Promise<Response> {
  if (request.headers.get('X-Internal-Call') !== 'service-binding') {
    return errorResponse('Not found', 404);
  }
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `internal_marketing_offer:${rateLimitClientIp(request)}`
  );
  if (limited !== null) {
    return limited;
  }
  const exit = await Effect.runPromiseExit(claimOffer(request, env, stripeFetch));
  return Exit.match(exit, {
    onSuccess: jsonResponse,
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isNone(failure)) {
        reportError('marketing offer defect', cause);
        return errorResponse('Unable to create offer', 500);
      }
      const error = failure.value;
      switch (error._tag) {
        case 'AdminUnauthorizedError':
          return errorResponse('Not found', 404);
        case 'InvalidJsonBodyError':
          return errorResponse('Enter a valid email address', 400);
        case 'OfferRateLimited':
          return errorResponse(error.message, 429);
        case 'OfferClaimBusy':
          return errorResponse(error.message, 409);
        case 'OfferConfigurationUnavailable':
          return errorResponse(error.message, 503);
        case 'OfferStoreUnavailable':
        case 'OfferGenerationUnavailable':
        case 'StripeOfferUnavailable':
        case 'StripeParseError':
          reportError(error.message, error.cause);
          return errorResponse('Unable to create offer', 502);
      }
    },
  });
}
