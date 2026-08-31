import type { APIEvent } from '@solidjs/start/server';
import { Cause, Effect, Exit, Option } from 'effect';
import { LicensingRoutes } from '../../../../shared/licensing-routes';

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

/** Read the request stream without ever buffering more than the offer contract permits. */
function readOfferBody(
  request: Request
): Effect.Effect<string, OfferProxyRejected | OfferProxyUnavailable> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_OFFER_BODY_BYTES) {
    return Effect.fail(new OfferProxyRejected(413));
  }

  return Effect.tryPromise({
    try: async () => {
      const reader = request.body?.getReader();
      if (reader === undefined) {
        return '';
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        total += next.value.byteLength;
        if (total > MAX_OFFER_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new OfferProxyRejected(413);
        }
        chunks.push(next.value);
      }
      const body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(body);
    },
    catch: cause =>
      cause instanceof OfferProxyRejected ? cause : new OfferProxyUnavailable(cause),
  });
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

    const body = yield* readOfferBody(event.request);

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
