import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { NormalizedEmail } from './shared-schemas.server';
import { ADMIN_CUSTOMER_NOTE_TYPES } from '../../../../shared/admin-customers';
import { BillingPortalResponseSchema, type BillingPortalRedirect } from '../contracts/billing';
import type {
  AdminCustomerNoteCreateInput,
  AdminCustomerNoteDeleteInput,
  AdminCustomerTagAssignmentInput,
  AdminCustomerTagCreateInput,
} from './admin-customer-form.server';
import { resolveAdminCustomerId } from './admin-customers.server';
import {
  AdminOverviewForbidden,
  LicensingSummaryInvalidPayload,
  LicensingSummaryStoreUnavailable,
  loadAdminServiceSession,
  parseLicensingInput,
  requestPrivateWorkerPayload,
  sendPrivateWorkerPayload,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
} from './licensing-service.server';

const MUTATION_RESPONSE_LIMIT = 16 * 1024;
const SuccessResponseSchema = Schema.Struct({ success: Schema.Literal(true) });
const IdentifierRowSchema = Schema.Struct({ id: Schema.String.check(Schema.isMinLength(1)) });
const NoteIdentifierRowSchema = Schema.Struct({
  id: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  match_count: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});

const NoteCreateSchema = Schema.Struct({
  email: NormalizedEmail,
  content: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(4000)),
  noteType: Schema.Literals(ADMIN_CUSTOMER_NOTE_TYPES),
});
const NoteDeleteSchema = Schema.Struct({
  email: NormalizedEmail,
  content: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(4000)),
  createdAt: Schema.String.check(
    Schema.isMaxLength(64),
    Schema.makeFilter(value => Number.isFinite(Date.parse(value)))
  ),
});
const TagAssignmentSchema = Schema.Struct({
  email: NormalizedEmail,
  tagName: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(64)),
  intent: Schema.Literals(['assign', 'remove']),
});
const TagCreateSchema = Schema.Struct({
  email: NormalizedEmail,
  name: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(64)),
  color: Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/u)),
  description: Schema.optional(
    Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(256))
  ),
});
const NOTE_ID_QUERY = `SELECT MIN(id) AS id, COUNT(*) AS match_count
  FROM customer_notes
  WHERE customer_id = ? AND content = ? AND created_at = ?`;
const TAG_ID_QUERY = 'SELECT id FROM customer_tags WHERE name = ?';

export class AdminCustomerMutationTargetChanged extends Error {
  readonly _tag = 'AdminCustomerMutationTargetChanged';
  constructor() {
    super('Admin customer mutation target changed');
  }
}

type AdminCustomerMutationError =
  LicensingSummaryError | AdminOverviewForbidden | AdminCustomerMutationTargetChanged;

function readStoreRow<S extends Schema.Top>(
  env: LicensingSummaryEnvironment,
  query: string,
  bindings: ReadonlyArray<string>,
  schema: S,
  operation: 'admin-customer-notes' | 'admin-customer-tags'
): Effect.Effect<
  S['Type'],
  LicensingSummaryStoreUnavailable | LicensingSummaryInvalidPayload,
  S['DecodingServices']
> {
  return Effect.gen(function* () {
    const value = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(query)
          .bind(...bindings)
          .first(),
      catch: cause => new LicensingSummaryStoreUnavailable(cause),
    });
    return yield* Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(cause => new LicensingSummaryInvalidPayload(operation, cause))
    );
  });
}

function resolveNoteId(
  env: LicensingSummaryEnvironment,
  customerId: string,
  content: string,
  createdAt: string
): Effect.Effect<
  string,
  | LicensingSummaryStoreUnavailable
  | LicensingSummaryInvalidPayload
  | AdminCustomerMutationTargetChanged
> {
  return Effect.gen(function* () {
    const row = yield* readStoreRow(
      env,
      NOTE_ID_QUERY,
      [customerId, content, createdAt],
      NoteIdentifierRowSchema,
      'admin-customer-notes'
    );
    if (row.id === null || row.match_count !== 1) {
      return yield* Effect.fail(new AdminCustomerMutationTargetChanged());
    }
    return row.id;
  });
}

function resolveTagId(
  env: LicensingSummaryEnvironment,
  name: string
): Effect.Effect<
  string,
  | LicensingSummaryStoreUnavailable
  | LicensingSummaryInvalidPayload
  | AdminCustomerMutationTargetChanged
> {
  return readStoreRow(
    env,
    TAG_ID_QUERY,
    [name],
    Schema.NullOr(IdentifierRowSchema),
    'admin-customer-tags'
  ).pipe(
    Effect.flatMap(row =>
      row === null ? Effect.fail(new AdminCustomerMutationTargetChanged()) : Effect.succeed(row.id)
    )
  );
}

/** Create one audited CRM note after resolving the selected customer server-side. */
export function createAdminCustomerNote(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  input: AdminCustomerNoteCreateInput
): Effect.Effect<void, AdminCustomerMutationError> {
  return Effect.gen(function* () {
    const safeInput = yield* parseLicensingInput(NoteCreateSchema, input, 'CRM note is invalid');
    const session = yield* loadAdminServiceSession(identity, env);
    const customerId = yield* resolveAdminCustomerId(safeInput.email, env);
    yield* sendPrivateWorkerPayload(
      env,
      session,
      '/api/admin/notes',
      'admin-customer-notes',
      MUTATION_RESPONSE_LIMIT,
      SuccessResponseSchema,
      { customerId, content: safeInput.content, noteType: safeInput.noteType }
    );
  });
}

/** Delete one exact visible CRM note without accepting its database identifier from the browser. */
export function deleteAdminCustomerNote(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  input: AdminCustomerNoteDeleteInput
): Effect.Effect<void, AdminCustomerMutationError> {
  return Effect.gen(function* () {
    const safeInput = yield* parseLicensingInput(NoteDeleteSchema, input, 'CRM note is invalid');
    const session = yield* loadAdminServiceSession(identity, env);
    const customerId = yield* resolveAdminCustomerId(safeInput.email, env);
    const noteId = yield* resolveNoteId(env, customerId, safeInput.content, safeInput.createdAt);
    const query = new URLSearchParams({ noteId }).toString();
    yield* requestPrivateWorkerPayload(
      env,
      session,
      `/api/admin/notes?${query}`,
      'admin-customer-notes',
      MUTATION_RESPONSE_LIMIT,
      SuccessResponseSchema,
      { method: 'DELETE' }
    );
  });
}

/** Assign or remove one unique catalog tag after resolving both private identifiers server-side. */
export function changeAdminCustomerTag(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  input: AdminCustomerTagAssignmentInput
): Effect.Effect<void, AdminCustomerMutationError> {
  return Effect.gen(function* () {
    const safeInput = yield* parseLicensingInput(
      TagAssignmentSchema,
      input,
      'CRM tag assignment is invalid'
    );
    const session = yield* loadAdminServiceSession(identity, env);
    const customerId = yield* resolveAdminCustomerId(safeInput.email, env);
    const tagId = yield* resolveTagId(env, safeInput.tagName);
    if (safeInput.intent === 'assign') {
      yield* sendPrivateWorkerPayload(
        env,
        session,
        '/api/admin/customer-tags',
        'admin-customer-tags',
        MUTATION_RESPONSE_LIMIT,
        SuccessResponseSchema,
        { customerId, tagId }
      );
      return;
    }
    const query = new URLSearchParams({ customerId, tagId }).toString();
    yield* requestPrivateWorkerPayload(
      env,
      session,
      `/api/admin/customer-tags?${query}`,
      'admin-customer-tags',
      MUTATION_RESPONSE_LIMIT,
      SuccessResponseSchema,
      { method: 'DELETE' }
    );
  });
}

/** Create one audited global CRM tag through the retained Worker contract. */
export function createAdminCustomerTag(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  input: AdminCustomerTagCreateInput
): Effect.Effect<void, AdminCustomerMutationError> {
  return Effect.gen(function* () {
    const safeInput = yield* parseLicensingInput(TagCreateSchema, input, 'CRM tag is invalid');
    const session = yield* loadAdminServiceSession(identity, env);
    yield* sendPrivateWorkerPayload(
      env,
      session,
      '/api/admin/tags',
      'admin-customer-tags',
      MUTATION_RESPONSE_LIMIT,
      SuccessResponseSchema,
      {
        name: safeInput.name,
        color: safeInput.color,
        ...(safeInput.description !== undefined && { description: safeInput.description }),
      }
    );
  });
}

/** Open delegated Stripe billing settings without exposing the provider customer identifier. */
export function createAdminCustomerBillingPortal(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  email: string
): Effect.Effect<BillingPortalRedirect, AdminCustomerMutationError> {
  return Effect.gen(function* () {
    const safeEmail = yield* parseLicensingInput(
      NormalizedEmail,
      email,
      'Billing customer email is invalid'
    );
    const session = yield* loadAdminServiceSession(identity, env);
    const portal = yield* sendPrivateWorkerPayload(
      env,
      session,
      '/api/billing/portal',
      'billing-portal',
      MUTATION_RESPONSE_LIMIT,
      BillingPortalResponseSchema,
      { email: safeEmail }
    );
    return { url: portal.url };
  });
}
