import { Cause, Effect, Exit, Option } from 'effect';
import { Schema } from '@effect/schema';
import {
  parseAdminApiSecret,
  parseWorkersApiUrl,
  AuthBridgeMisconfigured,
  AuthBridgeNetworkError,
  AuthBridgeStoreUnavailable,
  AuthBridgeUnauthorized,
  AuthBridgeWorkerRejected,
} from '~/lib/admin-session-bridge';
import {
  decodeProvisionResponse,
  EmailAddress,
  ProvisionParseError,
  type ProvisionResponse,
} from '~/lib/contracts/provision';
import { casesHandled } from '~/lib/prelude';

export type ProvisionLicenseError =
  | AuthBridgeUnauthorized
  | AuthBridgeMisconfigured
  | AuthBridgeNetworkError
  | AuthBridgeStoreUnavailable
  | AuthBridgeWorkerRejected
  | ProvisionParseError;

/** Posts a provision-user request to the Worker. */
export interface WorkerProvisionPoster {
  post(
    url: string,
    secret: string,
    body: { readonly email: string; readonly name: string }
  ): Effect.Effect<Response, AuthBridgeNetworkError>;
}

/** An authenticated Better Auth user requesting a license. */
export interface ProvisionUser {
  readonly email: string;
  readonly name: string;
}

/**
 * Call the locked Worker provision endpoint for an authenticated user.
 *
 * @param user - Better Auth session user.
 * @param workersApiUrl - Required Worker base URL.
 * @param adminSecret - Required admin secret.
 * @param poster - Fetch seam.
 * @returns The provision payload, or a tagged error.
 */
export function provisionLicenseForUser(
  user: ProvisionUser,
  workersApiUrl: string | undefined,
  adminSecret: string | undefined,
  poster: WorkerProvisionPoster
): Effect.Effect<ProvisionResponse, ProvisionLicenseError> {
  return Effect.gen(function* () {
    const url = yield* parseWorkersApiUrl(workersApiUrl);
    const secret = yield* parseAdminApiSecret(adminSecret);
    const email = yield* Schema.decodeUnknown(EmailAddress)(user.email).pipe(
      Effect.mapError(
        cause => new ProvisionParseError('Authenticated user email is invalid', cause)
      )
    );
    const response = yield* poster.post(`${url}/api/provision-user`, secret, {
      email,
      name: user.name,
    });
    if (!response.ok) {
      yield* Effect.fail(new AuthBridgeWorkerRejected(response.status));
    }
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause => new AuthBridgeNetworkError(cause),
    });
    return yield* decodeProvisionResponse(payload);
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function httpStatusFor(error: ProvisionLicenseError): number {
  switch (error._tag) {
    case 'AuthBridgeUnauthorized':
      return 401;
    case 'ProvisionParseError':
    case 'AuthBridgeWorkerRejected':
      return 502;
    case 'AuthBridgeMisconfigured':
    case 'AuthBridgeNetworkError':
    case 'AuthBridgeStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

/**
 * Map a provision-license Effect exit to an HTTP response without leaking secrets.
 *
 * @param exit - The completed provision attempt.
 * @returns JSON success or a safe error payload.
 */
export function responseFromProvisionLicenseExit(
  exit: Exit.Exit<ProvisionResponse, ProvisionLicenseError>
): Response {
  return Exit.match(exit, {
    onSuccess: payload =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        return jsonError(error.message, httpStatusFor(error));
      }
      return jsonError('Internal server error', 500);
    },
  });
}

/** Posts provision-user using `fetch`. */
export class FetchWorkerProvisionPoster implements WorkerProvisionPoster {
  post(
    url: string,
    secret: string,
    body: { readonly email: string; readonly name: string }
  ): Effect.Effect<Response, AuthBridgeNetworkError> {
    return Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': secret,
          },
          body: JSON.stringify(body),
        }),
      catch: cause => new AuthBridgeNetworkError(cause),
    });
  }
}
