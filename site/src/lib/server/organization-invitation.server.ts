import { Exit, Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { EMAIL_PATTERN } from '../../../../shared/email';
import type { AuthEnvironment } from './auth.server';
import {
  BoundedFormRejected,
  readBoundedUrlEncodedForm,
  readSingleFormParameter as oneParameter,
} from './bounded-form.server';
import { reportEffectFailure } from './observability.server';
import type { OrganizationWorkspaceIdentity } from './organization-workspace.server';

const INVITATION_FORM_LIMIT = 8 * 1024;
const ACTIVE_ORGANIZATION_QUERY = `SELECT COALESCE(
  (SELECT active_organization_id FROM auth_session WHERE user_id = ? AND token = ? LIMIT 1),
  (SELECT organization_id FROM auth_member WHERE user_id = ? ORDER BY created_at, id LIMIT 1)
) AS organizationId`;
const INVITATION_ORGANIZATION_QUERY = `SELECT invitation.organization_id AS organizationId
FROM auth_invitation AS invitation
JOIN auth_user AS identity
  ON identity.id = ?
  AND identity.email_verified = 1
  AND lower(identity.email) = lower(invitation.email)
WHERE invitation.id = ?
LIMIT 2`;
const PENDING_INVITATION_QUERY = `SELECT invitation.id, invitation.role
FROM auth_invitation AS invitation
JOIN auth_session AS session
  ON session.user_id = ?
  AND session.token = ?
  AND session.active_organization_id = invitation.organization_id
JOIN auth_member AS actor
  ON actor.organization_id = invitation.organization_id
  AND actor.user_id = ?
WHERE invitation.status = 'pending'
  AND lower(invitation.email) = ?
ORDER BY invitation.created_at DESC, invitation.id DESC
LIMIT 2`;
const ActiveOrganizationRowSchema = Schema.Struct({
  organizationId: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
  ),
});
const PendingInvitationRowSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  role: Schema.Literals(['admin', 'member']),
});
export const OrganizationInvitationEmailSchema = Schema.String.check(
  Schema.isMinLength(3),
  Schema.isMaxLength(320),
  Schema.isTrimmed(),
  Schema.isLowercased(),
  Schema.isPattern(EMAIL_PATTERN)
);
const InvitationRoleSchema = Schema.Literals(['admin', 'member']);
const InvitationFormSchema = Schema.Struct({
  email: OrganizationInvitationEmailSchema,
  role: InvitationRoleSchema,
});
const InvitationEmailFormSchema = Schema.Struct({ email: OrganizationInvitationEmailSchema });
const PendingInvitationResponseSchema = Schema.Struct({ status: Schema.Literal('pending') });
const CanceledInvitationResponseSchema = Schema.Struct({ status: Schema.Literal('canceled') });
const RejectedInvitationResponseSchema = Schema.Struct({
  invitation: Schema.Struct({ status: Schema.Literal('rejected') }),
  member: Schema.Null,
});
const AcceptedInvitationResponseSchema = Schema.Struct({
  invitation: Schema.Struct({ status: Schema.Literal('accepted') }),
  member: Schema.Struct({ role: Schema.Literals(['owner', 'admin', 'member']) }),
});
type InvitationBoundaryInput = Schema.Top['Encoded'];

/** Role granted to a newly invited employee. */
export type OrganizationInvitationRole = Schema.Schema.Type<typeof InvitationRoleSchema>;

/** Parsed form for a new or replacement organization invitation. */
type OrganizationInvitationForm = Schema.Schema.Type<typeof InvitationFormSchema>;

/** Parsed form used to resend or revoke an existing invitation. */
type OrganizationInvitationEmailForm = Schema.Schema.Type<typeof InvitationEmailFormSchema>;

/** A bounded invitation reference kept on the server for lifecycle actions. */
interface PendingOrganizationInvitation {
  readonly id: string;
  readonly role: OrganizationInvitationRole;
}

/** Parsed Better Auth result for a newly created or resent invitation. */
type OrganizationInvitationCreatedResult = Schema.Schema.Type<
  typeof PendingInvitationResponseSchema
>;

/** Parsed Better Auth result for a canceled invitation. */
type OrganizationInvitationCanceledResult = Schema.Schema.Type<
  typeof CanceledInvitationResponseSchema
>;

/** Parsed Better Auth result for an accepted invitation. */
type OrganizationInvitationAcceptedResult = Schema.Schema.Type<
  typeof AcceptedInvitationResponseSchema
>;

/** Parsed Better Auth result for a rejected invitation. */
type OrganizationInvitationRejectedResult = Schema.Schema.Type<
  typeof RejectedInvitationResponseSchema
>;

/** Better Auth operations used by the server-only organization action adapter. */
export interface OrganizationInvitationAuthGateway {
  readonly acceptInvitation: (input: {
    readonly body: { readonly invitationId: string };
    readonly headers: Headers;
  }) => Promise<OrganizationInvitationAcceptedResult>;
  readonly cancelInvitation: (input: {
    readonly body: { readonly invitationId: string };
    readonly headers: Headers;
  }) => Promise<OrganizationInvitationCanceledResult>;
  readonly rejectInvitation: (input: {
    readonly body: { readonly invitationId: string };
    readonly headers: Headers;
  }) => Promise<OrganizationInvitationRejectedResult>;
  readonly createInvitation: (input: {
    readonly body: {
      readonly email: string;
      readonly resend?: boolean;
      readonly role: OrganizationInvitationRole;
    };
    readonly headers: Headers;
  }) => Promise<OrganizationInvitationCreatedResult>;
}

/** A submitted invitation form is malformed or exceeds its byte limit. */
export class OrganizationInvitationFormInvalid extends Error {
  readonly _tag = 'OrganizationInvitationFormInvalid';

  constructor(readonly status: 400 | 413) {
    super('Organization invitation details are invalid');
  }
}

/** The organization invitation storage boundary could not be read. */
export class OrganizationInvitationStoreUnavailable extends Error {
  readonly _tag = 'OrganizationInvitationStoreUnavailable';

  constructor(override readonly cause?: unknown) {
    super('Organization invitation storage is unavailable');
  }
}

/** The requested pending invitation is not in the actor's active organization. */
export class OrganizationInvitationNotFound extends Error {
  readonly _tag = 'OrganizationInvitationNotFound';

  constructor() {
    super('Organization invitation was not found');
  }
}

/** Better Auth returned an unexpected mutation shape. */
export class OrganizationInvitationResponseInvalid extends Error {
  readonly _tag = 'OrganizationInvitationResponseInvalid';

  constructor() {
    super('Organization invitation response is invalid');
  }
}

function parseInvitationEmail(
  value: string
): Effect.Effect<string, OrganizationInvitationFormInvalid> {
  return Schema.decodeUnknownEffect(OrganizationInvitationEmailSchema)(
    value.trim().toLowerCase()
  ).pipe(Effect.mapError(() => new OrganizationInvitationFormInvalid(400)));
}

/** Parse one bounded new-invitation form. */
export function readOrganizationInvitationForm(
  request: Request
): Effect.Effect<OrganizationInvitationForm, OrganizationInvitationFormInvalid> {
  return readBoundedUrlEncodedForm(request, INVITATION_FORM_LIMIT).pipe(
    Effect.mapError(
      cause =>
        new OrganizationInvitationFormInvalid(
          cause instanceof BoundedFormRejected ? cause.status : 400
        )
    ),
    Effect.flatMap(params => {
      const email = oneParameter(params, 'email');
      const role = oneParameter(params, 'role');
      if (email === null || role === null) {
        return Effect.fail(new OrganizationInvitationFormInvalid(400));
      }
      return Effect.all({
        email: parseInvitationEmail(email),
        role: Schema.decodeUnknownEffect(InvitationRoleSchema)(role).pipe(
          Effect.mapError(() => new OrganizationInvitationFormInvalid(400))
        ),
      });
    })
  );
}

/** Parse one bounded email-only resend or revoke form. */
export function readOrganizationInvitationEmailForm(
  request: Request
): Effect.Effect<OrganizationInvitationEmailForm, OrganizationInvitationFormInvalid> {
  return readBoundedUrlEncodedForm(request, INVITATION_FORM_LIMIT).pipe(
    Effect.mapError(
      cause =>
        new OrganizationInvitationFormInvalid(
          cause instanceof BoundedFormRejected ? cause.status : 400
        )
    ),
    Effect.flatMap(params => {
      const email = oneParameter(params, 'email');
      return email === null
        ? Effect.fail(new OrganizationInvitationFormInvalid(400))
        : Effect.map(parseInvitationEmail(email), parsed => ({ email: parsed }));
    })
  );
}

/** Resolve the actor's active organization without returning its ID to callers. */
export async function loadActiveOrganizationId(
  identity: OrganizationWorkspaceIdentity,
  database: AuthEnvironment['DB']
): Promise<string | null> {
  try {
    const row = await database
      .prepare(ACTIVE_ORGANIZATION_QUERY)
      .bind(identity.id, identity.sessionToken, identity.id)
      .first();
    const decoded = Schema.decodeUnknownExit(ActiveOrganizationRowSchema)(row);
    if (Exit.isFailure(decoded)) {
      throw new OrganizationInvitationStoreUnavailable();
    }
    return decoded.value.organizationId;
  } catch (cause) {
    if (cause instanceof OrganizationInvitationStoreUnavailable) {
      throw cause;
    }
    throw new OrganizationInvitationStoreUnavailable(cause);
  }
}

/** Resolve an invitation's organization only for its verified recipient. */
export async function loadInvitationOrganizationId(
  identity: OrganizationWorkspaceIdentity,
  invitationId: string,
  database: AuthEnvironment['DB']
): Promise<string | null> {
  try {
    const row = await database
      .prepare(INVITATION_ORGANIZATION_QUERY)
      .bind(identity.id, invitationId)
      .first();
    const decoded = Schema.decodeUnknownExit(Schema.NullOr(ActiveOrganizationRowSchema))(row);
    if (Exit.isFailure(decoded)) {
      throw new OrganizationInvitationStoreUnavailable();
    }
    return decoded.value?.organizationId ?? null;
  } catch (cause) {
    if (cause instanceof OrganizationInvitationStoreUnavailable) {
      throw cause;
    }
    throw new OrganizationInvitationStoreUnavailable(cause);
  }
}

/** Find one pending invitation by normalized email in the active organization. */
export async function findPendingOrganizationInvitation(
  identity: OrganizationWorkspaceIdentity,
  email: string,
  database: AuthEnvironment['DB']
): Promise<PendingOrganizationInvitation | null> {
  try {
    const row = await database
      .prepare(PENDING_INVITATION_QUERY)
      .bind(identity.id, identity.sessionToken, identity.id, email)
      .first();
    const decoded = Schema.decodeUnknownExit(Schema.NullOr(PendingInvitationRowSchema))(row);
    if (Exit.isFailure(decoded)) {
      throw new OrganizationInvitationStoreUnavailable();
    }
    return decoded.value;
  } catch (cause) {
    if (cause instanceof OrganizationInvitationStoreUnavailable) {
      throw cause;
    }
    throw new OrganizationInvitationStoreUnavailable(cause);
  }
}

/** Parse a Better Auth create-invitation response at the server boundary. */
export function parseInvitationCreatedResult(
  value: InvitationBoundaryInput
): OrganizationInvitationCreatedResult {
  const decoded = Schema.decodeUnknownExit(PendingInvitationResponseSchema)(value);
  if (Exit.isFailure(decoded)) {
    throw new OrganizationInvitationResponseInvalid();
  }
  return decoded.value;
}

/** Parse a Better Auth cancellation response at the server boundary. */
export function parseInvitationCanceledResult(
  value: InvitationBoundaryInput
): OrganizationInvitationCanceledResult {
  const decoded = Schema.decodeUnknownExit(CanceledInvitationResponseSchema)(value);
  if (Exit.isFailure(decoded)) {
    throw new OrganizationInvitationResponseInvalid();
  }
  return decoded.value;
}

/** Parse a Better Auth rejection response at the server boundary. */
export function parseInvitationRejectedResult(
  value: InvitationBoundaryInput
): OrganizationInvitationRejectedResult {
  const decoded = Schema.decodeUnknownExit(RejectedInvitationResponseSchema)(value);
  if (Exit.isFailure(decoded)) {
    throw new OrganizationInvitationResponseInvalid();
  }
  return decoded.value;
}

/** Parse a Better Auth acceptance response at the server boundary. */
export function parseInvitationAcceptedResult(
  value: InvitationBoundaryInput
): OrganizationInvitationAcceptedResult {
  const decoded = Schema.decodeUnknownExit(AcceptedInvitationResponseSchema)(value);
  if (Exit.isFailure(decoded)) {
    throw new OrganizationInvitationResponseInvalid();
  }
  return decoded.value;
}

/** Audit events emitted by organization membership lifecycle actions. */
type OrganizationAuditAction =
  | 'organization.invitation.accepted'
  | 'organization.invitation.created'
  | 'organization.invitation.revoked'
  | 'organization.invitation.resent'
  | 'organization.invitation.rejected'
  | 'organization.invitation.delivery_failed'
  | 'organization.member.removed'
  | 'organization.member.role_changed'
  | 'organization.member.ownership_transferred';

/**
 * Persist one bounded invitation lifecycle audit event without making the
 * primary Better Auth mutation depend on the audit table.
 */
export async function recordOrganizationAudit(
  database: AuthEnvironment['DB'],
  request: Request,
  organizationId: string,
  action: OrganizationAuditAction,
  role?: OrganizationInvitationRole
): Promise<void> {
  const metadata = role === undefined ? null : JSON.stringify({ role });
  const result = await Effect.runPromiseExit(
    Effect.tryPromise({
      try: () =>
        database
          .prepare(
            `INSERT INTO audit_log
              (id, customer_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
             SELECT ?, organization.billing_customer_id, ?, 'organization', NULL, ?, ?, ?
             FROM auth_organization AS organization
             WHERE organization.id = ?`
          )
          .bind(
            crypto.randomUUID(),
            action,
            request.headers.get('CF-Connecting-IP')?.slice(0, 64) ?? null,
            request.headers.get('User-Agent')?.slice(0, 512) ?? null,
            metadata,
            organizationId
          )
          .run(),
      catch: cause => new OrganizationInvitationStoreUnavailable(cause),
    }).pipe(Effect.asVoid)
  );
  if (Exit.isFailure(result)) {
    reportEffectFailure('organization.invitation.audit_write_failed', result.cause);
  }
}
