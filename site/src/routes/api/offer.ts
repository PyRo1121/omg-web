import type { APIEvent } from '@solidjs/start/server';
import { Cause, Effect, Exit, Option } from 'effect';
import { LicensingRoutes } from '../../../shared/licensing-routes';

const MAX_OFFER_BODY_BYTES = 4096;

class OfferProxyRejected extends Error {
  readonly _tag = 'OfferProxyRejected';
  constructor(readonly status: 403 | 413) {
    super(status === 403 ? 'Offer request rejected' : 'Offer request is too large');
  }
}

class OfferProxyUnavailable extends Error {
  readonly _tag = 'OfferProxyUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Offer service unavailable');
  }
}

function proxyOffer(
  event: APIEvent
): Effect.Effect<Response, OfferProxyRejected | OfferProxyUnavailable> {
  return Effect.gen(function* () {
    const requestUrl = URL.parse(event.request.url);
    const origin = event.request.headers.get('Origin');
    if (requestUrl === null || (origin !== null && origin !== requestUrl.origin)) {
      return yield* Effect.fail(new OfferProxyRejected(403));
    }

    const cloudflareEnv = event.nativeEvent.context.cloudflare?.env;
    const service = cloudflareEnv?.LICENSING_API;
    const secret = cloudflareEnv?.ADMIN_API_SECRET;
    if (service === undefined || secret === undefined || secret.length === 0) {
      return yield* Effect.fail(new OfferProxyUnavailable());
    }

    const body = yield* Effect.tryPromise({
      try: () => event.request.text(),
      catch: cause => new OfferProxyUnavailable(cause),
    });
    if (new TextEncoder().encode(body).byteLength > MAX_OFFER_BODY_BYTES) {
      return yield* Effect.fail(new OfferProxyRejected(413));
    }

    return yield* Effect.tryPromise({
      try: () =>
        service.fetch(
          new Request(`https://omg-saas.internal${LicensingRoutes.marketingOffer.path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Secret': secret,
              'X-Internal-Call': 'service-binding',
              'X-Offer-Visitor-IP': event.request.headers.get('CF-Connecting-IP') ?? 'local',
            },
            body,
          })
        ),
      catch: cause => new OfferProxyUnavailable(cause),
    });
  });
}

export async function POST(event: APIEvent): Promise<Response> {
  const exit = await Effect.runPromiseExit(proxyOffer(event));
  return Exit.match(exit, {
    onSuccess: response =>
      new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
          'Cache-Control': 'private, no-store',
        },
      }),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isNone(failure)) {
        return Response.json({ error: 'Offer service unavailable' }, { status: 500 });
      }
      const error = failure.value;
      return Response.json(
        { error: error.message },
        { status: error._tag === 'OfferProxyRejected' ? error.status : 503 }
      );
    },
  });
}
