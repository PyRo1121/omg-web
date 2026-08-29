import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type { AuthEnvironment } from './auth.server';
import {
  OrganizationInvitationFormInvalid,
  readOrganizationInvitationEmailForm,
  readOrganizationInvitationForm,
  type OrganizationInvitationEmailForm,
  type OrganizationInvitationForm,
  type OrganizationInvitationRole,
} from './organization-invitation.server';
import type { OrganizationWorkspaceIdentity } from './organization-workspace.server';

const TARGET_MEMBER_QUERY = `SELECT
  target.id,
  target.user_id AS userId,
  target.role
FROM auth_member AS target
JOIN auth_session AS session
  ON session.user_id = ?
  AND session.token = ?
  AND session.active_organization_id = target.organization_id
JOIN auth_member AS actor
  ON actor.organization_id = target.organization_id
  AND actor.user_id = ?
JOIN auth_user AS targetUser ON targetUser.id = target.user_id
WHERE lower(targetUser.email) = ?
LIMIT 2`;
const MemberRoleSchema = Schema.Literals(['owner', 'admin', 'member']);
const TargetMemberRowSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  role: MemberRoleSchema,
  userId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
});
const UpdatedMemberResponseSchema = Schema.Struct({ role: MemberRoleSchema });
const RemovedMemberResponseSchema = Schema.Struct({
  member: Schema.Struct({ role: MemberRoleSchema }),
});
type MemberBoundaryInput = Schema.Top['Encoded'];

/** A server-only target membership resolved from the active organization. */
export interface OrganizationMemberTarget {
  readonly id: string;
  readonly role: OrganizationInvitationRole | 'owner';
  readonly userId: string;
}

/** Parsed role-change form for an existing organization member. */
export type OrganizationMemberRoleForm = OrganizationInvitationForm;

/** Parsed removal form for an existing organization member. */
export type OrganizationMemberEmailForm = OrganizationInvitationEmailForm;

/** The requested member is not in the actor's active organization. */
export class OrganizationMemberNotFound extends Error {
  readonly _tag = 'OrganizationMemberNotFound';

  constructor() {
    super('Organization member was not found');
  }
}

/** The member target cannot be changed by the requested operation. */
export class OrganizationMemberProtected extends Error {
  readonly _tag = 'OrganizationMemberProtected';

  constructor(readonly reason: 'owner' | 'self') {
    super('This organization member cannot be changed');
  }
}

/** The organization member storage boundary could not be read. */
export class OrganizationMemberStoreUnavailable extends Error {
  readonly _tag = 'OrganizationMemberStoreUnavailable';

  constructor(override readonly cause?: unknown) {
    super('Organization member storage is unavailable');
  }
}

/** Better Auth returned an unexpected member mutation shape. */
export class OrganizationMemberResponseInvalid extends Error {
  readonly _tag = 'OrganizationMemberResponseInvalid';

  constructor() {
    super('Organization member response is invalid');
  }
}

/** Parse one bounded member role-change form. */
export function readOrganizationMemberRoleForm(
  request: Request
): Effect.Effect<OrganizationMemberRoleForm, OrganizationInvitationFormInvalid> {
  return readOrganizationInvitationForm(request);
}

/** Parse one bounded member-removal form. */
export function readOrganizationMemberEmailForm(
  request: Request
): Effect.Effect<OrganizationMemberEmailForm, OrganizationInvitationFormInvalid> {
  return readOrganizationInvitationEmailForm(request);
}

/** Resolve one member by email within the actor's active organization. */
export async function findOrganizationMemberTarget(
  identity: OrganizationWorkspaceIdentity,
  email: string,
  database: AuthEnvironment['DB']
): Promise<OrganizationMemberTarget | null> {
  try {
    const row = await database
      .prepare(TARGET_MEMBER_QUERY)
      .bind(identity.id, identity.sessionToken, identity.id, email)
      .first();
    const decoded = Schema.decodeUnknownExit(Schema.NullOr(TargetMemberRowSchema))(row);
    if (Exit.isFailure(decoded)) {
      throw new OrganizationMemberStoreUnavailable();
    }
    return decoded.value;
  } catch (cause) {
    if (cause instanceof OrganizationMemberStoreUnavailable) {
      throw cause;
    }
    throw new OrganizationMemberStoreUnavailable(cause);
  }
}

/** Parse a Better Auth role update response at the server boundary. */
export function parseUpdatedMemberResult(
  value: MemberBoundaryInput
): Schema.Schema.Type<typeof UpdatedMemberResponseSchema> {
  const decoded = Schema.decodeUnknownExit(UpdatedMemberResponseSchema)(value);
  if (Exit.isFailure(decoded)) {
    throw new OrganizationMemberResponseInvalid();
  }
  return decoded.value;
}

/** Parse a Better Auth removal response at the server boundary. */
export function parseRemovedMemberResult(
  value: MemberBoundaryInput
): Schema.Schema.Type<typeof RemovedMemberResponseSchema> {
  const decoded = Schema.decodeUnknownExit(RemovedMemberResponseSchema)(value);
  if (Exit.isFailure(decoded)) {
    throw new OrganizationMemberResponseInvalid();
  }
  return decoded.value;
}

/** Better Auth member operations used by server-only organization actions. */
export interface OrganizationMemberAuthGateway {
  readonly removeMember: (input: {
    readonly body: { readonly memberIdOrEmail: string };
    readonly headers: Headers;
  }) => Promise<Schema.Schema.Type<typeof RemovedMemberResponseSchema>>;
  readonly updateMemberRole: (input: {
    readonly body: { readonly memberId: string; readonly role: OrganizationInvitationRole };
    readonly headers: Headers;
  }) => Promise<Schema.Schema.Type<typeof UpdatedMemberResponseSchema>>;
}
