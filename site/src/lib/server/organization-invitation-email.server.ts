import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { NormalizedEmail } from './shared-schemas.server';
import type { OrganizationInvitationEmailRequest } from '../../../../shared/organization-invitation-email';
import {
  sendInternalWorkerPayload,
  type LicensingSummaryEnvironment,
} from './licensing-service.server';
import {
  createOrganizationInvitationReference,
  ORGANIZATION_INVITATION_ACCEPT_PATH,
} from './organization-invitation-token.server';

const EMAIL_BODY_LIMIT = 4 * 1024;

const OrganizationName = Schema.String.check(
  Schema.isMinLength(2),
  Schema.isMaxLength(80),
  Schema.isTrimmed(),
  Schema.isPattern(/^[^\r\n]+$/u)
);
const InvitationUrl = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2048),
  Schema.isTrimmed()
);
const invitationEmailFields = {
  email: NormalizedEmail,
  organizationName: OrganizationName,
  role: Schema.Literals(['admin', 'member']),
};
const InvitationEmailFieldsSchema = Schema.Struct(invitationEmailFields);
const InvitationEmailRequestSchema = Schema.Struct({
  ...invitationEmailFields,
  invitationUrl: InvitationUrl,
});
const InvitationEmailResponseSchema = Schema.Struct({ sent: Schema.Literal(true) });

/** Data required to deliver one Better Auth invitation email. */
interface OrganizationInvitationEmailInput {
  readonly email: string;
  readonly expiresAt: Date | string;
  readonly invitationId: string;
  readonly organizationName: string;
  readonly role: string;
}

type OrganizationInvitationEmailEnvironment = LicensingSummaryEnvironment & {
  readonly BETTER_AUTH_SECRET: string;
};

/** Email delivery failed before a successful Worker acknowledgement. */
export class OrganizationInvitationDeliveryFailed extends Error {
  readonly _tag = 'OrganizationInvitationDeliveryFailed';

  constructor(override readonly cause?: unknown) {
    super('Organization invitation email delivery failed');
  }
}

/**
 * Build an opaque invitation URL and deliver it through the private Worker capability.
 *
 * Better Auth IDs stay inside an encrypted reference. The browser-facing URL
 * carries only that reference and no database identifier.
 */
export function sendOrganizationInvitationEmail(
  input: OrganizationInvitationEmailInput,
  env: OrganizationInvitationEmailEnvironment,
  requestUrl: URL
): Promise<void> {
  const effect = Effect.gen(function* () {
    const parsedInput = yield* Schema.decodeUnknownEffect(InvitationEmailFieldsSchema)({
      email: input.email.trim().toLowerCase(),
      organizationName: input.organizationName,
      role: input.role,
    }).pipe(Effect.mapError(cause => new OrganizationInvitationDeliveryFailed(cause)));
    const reference = yield* createOrganizationInvitationReference(
      input.invitationId,
      input.expiresAt,
      env.BETTER_AUTH_SECRET
    ).pipe(Effect.mapError(cause => new OrganizationInvitationDeliveryFailed(cause)));
    if (requestUrl.protocol !== 'https:') {
      return yield* Effect.fail(new OrganizationInvitationDeliveryFailed());
    }
    const invitationUrl = new URL(ORGANIZATION_INVITATION_ACCEPT_PATH, requestUrl.origin);
    invitationUrl.searchParams.set('token', reference);
    const request: OrganizationInvitationEmailRequest = yield* Schema.decodeUnknownEffect(
      InvitationEmailRequestSchema
    )({
      ...parsedInput,
      invitationUrl: invitationUrl.toString(),
    }).pipe(Effect.mapError(cause => new OrganizationInvitationDeliveryFailed(cause)));
    const response = yield* sendInternalWorkerPayload(
      env,
      '/api/internal/organization-invitation-email',
      'organization-invitation-email',
      EMAIL_BODY_LIMIT,
      InvitationEmailResponseSchema,
      request
    ).pipe(Effect.mapError(cause => new OrganizationInvitationDeliveryFailed(cause)));
    if (response.sent !== true) {
      return yield* Effect.fail(new OrganizationInvitationDeliveryFailed());
    }
  }).pipe(Effect.asVoid);

  return Effect.runPromise(effect);
}
