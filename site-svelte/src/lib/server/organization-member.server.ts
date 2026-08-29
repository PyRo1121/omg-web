import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type { AuthEnvironment } from './auth.server';
import { BoundedFormRejected, readBoundedUrlEncodedForm } from './bounded-form.server';
import {
  OrganizationInvitationEmailSchema,
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
const CURRENT_SESSION_QUERY = `SELECT created_at AS createdAt
FROM auth_session
WHERE user_id = ? AND token = ? AND expires_at > ?
LIMIT 2`;
const PROMOTE_OWNER_QUERY = `UPDATE auth_member
SET role = 'owner'
WHERE id = ?
  AND organization_id = ?
  AND role IN ('admin', 'member')
  AND EXISTS (
    SELECT 1
    FROM auth_session AS current_session
    WHERE current_session.user_id = ?
      AND current_session.token = ?
      AND current_session.active_organization_id = ?
      AND current_session.expires_at > ?
  )
  AND EXISTS (
    SELECT 1
    FROM auth_member AS current_owner
    WHERE current_owner.organization_id = ?
      AND current_owner.user_id = ?
      AND current_owner.role = 'owner'
  )`;
const DEMOTE_OWNER_QUERY = `UPDATE auth_member
SET role = 'admin'
WHERE organization_id = ?
  AND user_id = ?
  AND role = 'owner'
  AND EXISTS (
    SELECT 1
    FROM auth_member AS replacement_owner
    WHERE replacement_owner.organization_id = ?
      AND replacement_owner.id = ?
      AND replacement_owner.role = 'owner'
  )`;
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
const CurrentSessionSchema = Schema.Struct({
  createdAt: Schema.Union([Schema.Number, Schema.String]),
});
const OwnershipTransferConfirmationSchema = Schema.Literal('TRANSFER OWNERSHIP');
const OwnershipTransferFormSchema = Schema.Struct({
  confirmation: OwnershipTransferConfirmationSchema,
  email: OrganizationInvitationEmailSchema,
});
type MemberBoundaryInput = Schema.Top['Encoded'];
const OWNER_TRANSFER_FORM_LIMIT = 8 * 1024;
const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1000;
interface OrganizationMemberWriteResult {
  readonly meta: { readonly changes: number };
}

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

/** A recent authentication is required before ownership can change. */
export class OrganizationMemberRecentAuthRequired extends Error {
  readonly _tag = 'OrganizationMemberRecentAuthRequired';

  constructor() {
    super('A recent authentication is required');
  }
}

/** The ownership transfer could not atomically complete. */
export class OrganizationMemberTransferConflict extends Error {
  readonly _tag = 'OrganizationMemberTransferConflict';

  constructor() {
    super('Organization ownership changed before the transfer completed');
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

function oneParameter(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  return values.length === 1 ? (values[0] ?? null) : null;
}

/** Parse the exact target and second confirmation required for ownership transfer. */
export function readOrganizationOwnershipTransferForm(
  request: Request
): Effect.Effect<
  Schema.Schema.Type<typeof OwnershipTransferFormSchema>,
  OrganizationInvitationFormInvalid
> {
  return readBoundedUrlEncodedForm(request, OWNER_TRANSFER_FORM_LIMIT).pipe(
    Effect.mapError(
      cause =>
        new OrganizationInvitationFormInvalid(
          cause instanceof BoundedFormRejected ? cause.status : 400
        )
    ),
    Effect.flatMap(params => {
      const email = oneParameter(params, 'email');
      const confirmation = oneParameter(params, 'confirmation');
      if (email === null || confirmation === null) {
        return Effect.fail(new OrganizationInvitationFormInvalid(400));
      }
      return Effect.all({
        confirmation: Schema.decodeUnknownEffect(OwnershipTransferConfirmationSchema)(
          confirmation
        ).pipe(Effect.mapError(() => new OrganizationInvitationFormInvalid(400))),
        email: Schema.decodeUnknownEffect(OrganizationInvitationEmailSchema)(
          email.trim().toLowerCase()
        ).pipe(Effect.mapError(() => new OrganizationInvitationFormInvalid(400))),
      });
    })
  );
}

/** Return whether the current Better Auth session was created recently enough for transfer. */
export async function hasRecentOrganizationAuthentication(
  identity: OrganizationWorkspaceIdentity,
  database: AuthEnvironment['DB'],
  now: Date = new Date()
): Promise<boolean> {
  if (Number.isNaN(now.getTime())) {
    throw new OrganizationMemberStoreUnavailable();
  }
  try {
    const row = await database
      .prepare(CURRENT_SESSION_QUERY)
      .bind(identity.id, identity.sessionToken, now.getTime())
      .first();
    const decoded = Schema.decodeUnknownExit(Schema.NullOr(CurrentSessionSchema))(row);
    if (Exit.isFailure(decoded)) {
      throw new OrganizationMemberStoreUnavailable();
    }
    if (decoded.value === null) {
      return false;
    }
    const createdAt = new Date(decoded.value.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new OrganizationMemberStoreUnavailable();
    }
    const age = now.getTime() - createdAt.getTime();
    return age >= 0 && age <= RECENT_AUTH_MAX_AGE_MS;
  } catch (cause) {
    if (cause instanceof OrganizationMemberStoreUnavailable) {
      throw cause;
    }
    throw new OrganizationMemberStoreUnavailable(cause);
  }
}

/** Atomically promote the target and demote the current Owner in Better Auth storage. */
export async function transferOrganizationOwnership(
  identity: OrganizationWorkspaceIdentity,
  organizationId: string,
  target: OrganizationMemberTarget,
  database: AuthEnvironment['DB'],
  now: Date = new Date()
): Promise<void> {
  if (Number.isNaN(now.getTime())) {
    throw new OrganizationMemberStoreUnavailable();
  }
  try {
    const results: ReadonlyArray<OrganizationMemberWriteResult> = await database.batch([
      database
        .prepare(PROMOTE_OWNER_QUERY)
        .bind(
          target.id,
          organizationId,
          identity.id,
          identity.sessionToken,
          organizationId,
          now.getTime(),
          organizationId,
          identity.id
        ),
      database
        .prepare(DEMOTE_OWNER_QUERY)
        .bind(organizationId, identity.id, organizationId, target.id),
    ]);
    if (results.length !== 2 || results.some(result => result.meta.changes !== 1)) {
      throw new OrganizationMemberTransferConflict();
    }
  } catch (cause) {
    if (cause instanceof OrganizationMemberTransferConflict) {
      throw cause;
    }
    throw new OrganizationMemberStoreUnavailable(cause);
  }
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
