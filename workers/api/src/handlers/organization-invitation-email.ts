import { Cause, Effect, Exit, Option } from 'effect';
import * as Schema from 'effect/Schema';
import type { OrganizationInvitationEmailResponse } from '../../../../shared/organization-invitation-email';
import { EMAIL_PATTERN } from '../../../../shared/email';
import { AdminUnauthorizedError, requireInternalSecret } from '../admin-secret';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import type { Env } from '../api';
import { enforceRateLimit, errorResponse, jsonResponse, rateLimitClientIp } from '../api';
import { reportError } from '../observability';

const PRIVATE_BODY_LIMIT = 8 * 1024;
const INVITATION_ACCEPT_PATH = '/dashboard/organization/invitations/accept/';
const NormalizedEmail = Schema.String.pipe(
  Schema.transform(Schema.String, {
    decode: (value: string) => value.trim().toLowerCase(),
    encode: (value: string) => value,
  }),
  Schema.minLength(3),
  Schema.maxLength(320),
  Schema.pattern(EMAIL_PATTERN)
);
const OrganizationName = Schema.String.pipe(
  Schema.transform(Schema.String, {
    decode: (value: string) => value.trim(),
    encode: (value: string) => value,
  }),
  Schema.minLength(2),
  Schema.maxLength(80),
  Schema.pattern(/^[^\r\n]+$/u)
);
const InvitationUrl = Schema.String.pipe(
  Schema.transform(Schema.String, {
    decode: (value: string) => value.trim(),
    encode: (value: string) => value,
  }),
  Schema.minLength(1),
  Schema.maxLength(2048)
);
const OrganizationInvitationEmailRequestSchema = Schema.Struct({
  email: NormalizedEmail,
  organizationName: OrganizationName,
  role: Schema.Literal('admin', 'member'),
  invitationUrl: InvitationUrl,
});
const OpaqueReference = Schema.String.pipe(
  Schema.minLength(32),
  Schema.maxLength(2048),
  Schema.pattern(/^[A-Za-z0-9_.-]+$/u)
);

/** The message shape passed to the email service adapter. */
interface OrganizationInvitationEmailMessage {
  readonly to: string;
  readonly from: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** A private email adapter used by the handler and its integration tests. */
type OrganizationInvitationEmailSender = (
  message: OrganizationInvitationEmailMessage
) => Promise<void>;

class InvitationEmailPayloadInvalid extends Error {
  readonly _tag = 'InvitationEmailPayloadInvalid';

  constructor() {
    super('Invitation email payload is invalid');
  }
}

class InvitationEmailDeliveryFailed extends Error {
  readonly _tag = 'InvitationEmailDeliveryFailed';

  constructor(override readonly cause?: unknown) {
    super('Invitation email delivery failed');
  }
}

type InvitationEmailError =
  | AdminUnauthorizedError
  | InvalidJsonBodyError
  | InvitationEmailPayloadInvalid
  | InvitationEmailDeliveryFailed;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/gu,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character
  );
}

function invitationUrl(value: string): Effect.Effect<URL, InvitationEmailPayloadInvalid> {
  const parsed = URL.parse(value);
  if (
    parsed === null ||
    parsed.protocol !== 'https:' ||
    parsed.port !== '' ||
    (parsed.hostname !== 'omg.latham.cloud' && !parsed.hostname.endsWith('.latham.workers.dev'))
  ) {
    return Effect.fail(new InvitationEmailPayloadInvalid());
  }
  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hash !== '' ||
    parsed.pathname !== INVITATION_ACCEPT_PATH
  ) {
    return Effect.fail(new InvitationEmailPayloadInvalid());
  }
  const keys = Array.from(parsed.searchParams.keys());
  const token = parsed.searchParams.get('token');
  if (keys.length !== 1 || keys[0] !== 'token' || token === null) {
    return Effect.fail(new InvitationEmailPayloadInvalid());
  }
  const decodedToken = Schema.decodeUnknownEither(OpaqueReference)(token);
  return decodedToken._tag === 'Right'
    ? Effect.succeed(parsed)
    : Effect.fail(new InvitationEmailPayloadInvalid());
}

function renderEmail(
  input: Schema.Schema.Type<typeof OrganizationInvitationEmailRequestSchema>,
  url: URL
): OrganizationInvitationEmailMessage {
  const organizationName = escapeHtml(input.organizationName);
  const link = escapeHtml(url.toString());
  const role = input.role === 'admin' ? 'Administrator' : 'Member';
  return {
    to: input.email,
    from: 'OMG <noreply@latham.cloud>',
    subject: 'You have been invited to an OMG workspace',
    html: [
      '<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#202124">',
      `<h1>Join ${organizationName} on OMG</h1>`,
      `<p>You have been invited as an ${role.toLowerCase()} to an OMG organization workspace.</p>`,
      `<p><a href="${link}">Open your organization invitation</a></p>`,
      '<p>This invitation expires in 48 hours. If you did not expect it, you can ignore this email.</p>',
      '</body></html>',
    ].join(''),
    text: [
      `You have been invited to join ${input.organizationName} on OMG as an ${role.toLowerCase()}.`,
      '',
      `Open your organization invitation: ${url.toString()}`,
      '',
      'This invitation expires in 48 hours. If you did not expect it, you can ignore this email.',
    ].join('\n'),
  };
}

function cloudflareEmailSender(env: Env): OrganizationInvitationEmailSender {
  return message =>
    Effect.runPromise(
      Effect.tryPromise({
        try: () =>
          env.EMAIL.send({
            to: message.to,
            from: message.from,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        catch: cause => new InvitationEmailDeliveryFailed(cause),
      }).pipe(Effect.asVoid)
    );
}

function sendInvitationEmail(
  request: Request,
  env: Env,
  sender: OrganizationInvitationEmailSender
): Effect.Effect<{ readonly sent: true }, InvitationEmailError> {
  return Effect.gen(function* () {
    yield* requireInternalSecret(request.headers.get('X-Admin-Secret'), [env.SVELTE_BFF_SECRET]);
    const body = yield* decodeJsonBody(
      request,
      OrganizationInvitationEmailRequestSchema,
      PRIVATE_BODY_LIMIT
    ).pipe(Effect.mapError(error => error));
    const url = yield* invitationUrl(body.invitationUrl);
    const reference = Schema.decodeUnknownEither(OpaqueReference)(url.searchParams.get('token'));
    if (reference._tag === 'Left') {
      return yield* Effect.fail(new InvitationEmailPayloadInvalid());
    }
    yield* Effect.tryPromise({
      try: () => sender(renderEmail(body, url)),
      catch: cause =>
        cause instanceof InvitationEmailDeliveryFailed
          ? cause
          : new InvitationEmailDeliveryFailed(cause),
    });
    return { sent: true };
  });
}

/**
 * Send one bounded organization invitation through the Worker's native email binding.
 *
 * The route is private to the Svelte service binding and accepts only the
 * independent Svelte BFF secret. It returns a boolean acknowledgement rather
 * than the provider message identifier.
 */
export async function handleOrganizationInvitationEmail(
  request: Request,
  env: Env,
  sender: OrganizationInvitationEmailSender = cloudflareEmailSender(env)
): Promise<Response> {
  if (request.headers.get('X-Internal-Call') !== 'service-binding') {
    return errorResponse('Not found', 404);
  }
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `internal_organization_invitation_email:${rateLimitClientIp(request)}`
  );
  if (limited !== null) {
    return limited;
  }

  const exit = await Effect.runPromiseExit(sendInvitationEmail(request, env, sender));
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload satisfies OrganizationInvitationEmailResponse),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isNone(failure)) {
        reportError('organization_invitation_email.defect', cause);
        return errorResponse('Invitation email unavailable', 503);
      }
      switch (failure.value._tag) {
        case 'AdminUnauthorizedError':
          return errorResponse('Not found', 404);
        case 'InvalidJsonBodyError':
        case 'InvitationEmailPayloadInvalid':
          return errorResponse('Invitation email request is invalid', 400);
        case 'InvitationEmailDeliveryFailed':
          reportError('organization_invitation_email.delivery_failed');
          return errorResponse('Invitation email unavailable', 503);
      }
    },
  });
}
