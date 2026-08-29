import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  ADMIN_CUSTOMER_NOTE_TYPES,
  ADMIN_CUSTOMER_STATUSES,
  ADMIN_CUSTOMER_TIERS,
  type AdminCustomerStatus,
  type AdminCustomerTier,
} from '../../../../site/shared/admin-customers';
import { EMAIL_PATTERN } from '../../../../site/shared/email';
import {
  readBoundedUrlEncodedForm,
  type BoundedFormRejected,
  type BoundedFormUnavailable,
} from './bounded-form.server';

const MAX_ADMIN_CUSTOMER_FORM_BYTES = 8 * 1024;
const EmailFieldSchema = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isLowercased(),
  Schema.isPattern(EMAIL_PATTERN)
);
const CustomerUpdateFormSchema = Schema.Struct({
  email: EmailFieldSchema,
  tier: Schema.Literals(ADMIN_CUSTOMER_TIERS),
  status: Schema.Literals(ADMIN_CUSTOMER_STATUSES),
  confirmation: Schema.Literal('confirmed'),
});
const NoteContentSchema = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isMinLength(1),
  Schema.isMaxLength(4000)
);
const NoteCreateFormSchema = Schema.Struct({
  email: EmailFieldSchema,
  content: NoteContentSchema,
  noteType: Schema.Literals(ADMIN_CUSTOMER_NOTE_TYPES),
});
const NoteDeleteFormSchema = Schema.Struct({
  email: EmailFieldSchema,
  content: NoteContentSchema,
  createdAt: Schema.String.check(
    Schema.isMaxLength(64),
    Schema.makeFilter(value => Number.isFinite(Date.parse(value)))
  ),
  confirmation: Schema.Literal('delete-note'),
});
const TagAssignmentFormSchema = Schema.Struct({
  email: EmailFieldSchema,
  tagName: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(64)),
  intent: Schema.Literals(['assign', 'remove']),
});
const TagCreateFormSchema = Schema.Struct({
  email: EmailFieldSchema,
  name: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(64)),
  color: Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/u)),
  description: Schema.optional(
    Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(256))
  ),
});
const BillingPortalFormSchema = Schema.Struct({
  email: EmailFieldSchema,
  confirmation: Schema.Literal('open-billing'),
});

export interface AdminCustomerLicenseFormInput {
  readonly email: string;
  readonly tier: AdminCustomerTier;
  readonly status: AdminCustomerStatus;
}

export interface AdminCustomerNoteCreateInput {
  readonly email: string;
  readonly content: string;
  readonly noteType: (typeof ADMIN_CUSTOMER_NOTE_TYPES)[number];
}

export interface AdminCustomerNoteDeleteInput {
  readonly email: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface AdminCustomerTagAssignmentInput {
  readonly email: string;
  readonly tagName: string;
  readonly intent: 'assign' | 'remove';
}

export interface AdminCustomerTagCreateInput {
  readonly email: string;
  readonly name: string;
  readonly color: string;
  readonly description?: string;
}

class AdminCustomerFormInvalid extends Error {
  readonly _tag = 'AdminCustomerFormInvalid';
  constructor(override readonly cause?: unknown) {
    super('Admin customer form is invalid');
  }
}

type AdminCustomerFormError =
  AdminCustomerFormInvalid | BoundedFormRejected | BoundedFormUnavailable;

function decodeForm<S extends Schema.Top>(
  schema: S,
  value: Schema.Top['Encoded']
): Effect.Effect<S['Type'], AdminCustomerFormInvalid, S['DecodingServices']> {
  return Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(cause => new AdminCustomerFormInvalid(cause))
  );
}

/** Bound and decode the inspect action's sole customer selector. */
export function readAdminCustomerSelection(
  request: Request
): Effect.Effect<string, AdminCustomerFormError> {
  return Effect.gen(function* () {
    const form = yield* readBoundedUrlEncodedForm(request, MAX_ADMIN_CUSTOMER_FORM_BYTES);
    return yield* decodeForm(EmailFieldSchema, form.get('email'));
  });
}

/** Bound and decode a confirmed license mutation into its trusted domain input. */
export function readAdminCustomerLicenseUpdate(
  request: Request
): Effect.Effect<AdminCustomerLicenseFormInput, AdminCustomerFormError> {
  return Effect.gen(function* () {
    const form = yield* readBoundedUrlEncodedForm(request, MAX_ADMIN_CUSTOMER_FORM_BYTES);
    const input = yield* decodeForm(CustomerUpdateFormSchema, {
      email: form.get('email'),
      tier: form.get('tier'),
      status: form.get('status'),
      confirmation: form.get('confirmation'),
    });
    return { email: input.email, tier: input.tier, status: input.status };
  });
}

/** Decode one CRM note creation without accepting a customer or note database key. */
export function readAdminCustomerNoteCreate(
  request: Request
): Effect.Effect<AdminCustomerNoteCreateInput, AdminCustomerFormError> {
  return Effect.gen(function* () {
    const form = yield* readBoundedUrlEncodedForm(request, MAX_ADMIN_CUSTOMER_FORM_BYTES);
    return yield* decodeForm(NoteCreateFormSchema, {
      email: form.get('email'),
      content: form.get('content')?.trim(),
      noteType: form.get('noteType'),
    });
  });
}

/** Decode an exactly confirmed note deletion using only already-visible note fields. */
export function readAdminCustomerNoteDelete(
  request: Request
): Effect.Effect<AdminCustomerNoteDeleteInput, AdminCustomerFormError> {
  return Effect.gen(function* () {
    const form = yield* readBoundedUrlEncodedForm(request, MAX_ADMIN_CUSTOMER_FORM_BYTES);
    const input = yield* decodeForm(NoteDeleteFormSchema, {
      email: form.get('email'),
      content: form.get('content')?.trim(),
      createdAt: form.get('createdAt'),
      confirmation: form.get('confirmation'),
    });
    return { email: input.email, content: input.content, createdAt: input.createdAt };
  });
}

/** Decode one existing catalog tag assignment or removal by its unique public name. */
export function readAdminCustomerTagAssignment(
  request: Request
): Effect.Effect<AdminCustomerTagAssignmentInput, AdminCustomerFormError> {
  return Effect.gen(function* () {
    const form = yield* readBoundedUrlEncodedForm(request, MAX_ADMIN_CUSTOMER_FORM_BYTES);
    return yield* decodeForm(TagAssignmentFormSchema, {
      email: form.get('email'),
      tagName: form.get('tagName')?.trim(),
      intent: form.get('intent'),
    });
  });
}

/** Decode a new bounded global CRM tag. */
export function readAdminCustomerTagCreate(
  request: Request
): Effect.Effect<AdminCustomerTagCreateInput, AdminCustomerFormError> {
  return Effect.gen(function* () {
    const form = yield* readBoundedUrlEncodedForm(request, MAX_ADMIN_CUSTOMER_FORM_BYTES);
    const rawDescription = form.get('description')?.trim();
    const input = yield* decodeForm(TagCreateFormSchema, {
      email: form.get('email'),
      name: form.get('name')?.trim(),
      color: form.get('color'),
      ...(rawDescription !== undefined &&
        rawDescription.length > 0 && {
          description: rawDescription,
        }),
    });
    return input.description === undefined
      ? { email: input.email, name: input.name, color: input.color }
      : {
          email: input.email,
          name: input.name,
          color: input.color,
          description: input.description,
        };
  });
}

/** Decode an explicitly confirmed delegated Billing Portal request. */
export function readAdminBillingPortalRequest(
  request: Request
): Effect.Effect<string, AdminCustomerFormError> {
  return Effect.gen(function* () {
    const form = yield* readBoundedUrlEncodedForm(request, MAX_ADMIN_CUSTOMER_FORM_BYTES);
    const input = yield* decodeForm(BillingPortalFormSchema, {
      email: form.get('email'),
      confirmation: form.get('confirmation'),
    });
    return input.email;
  });
}
