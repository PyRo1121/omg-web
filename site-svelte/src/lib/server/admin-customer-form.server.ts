import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
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

export interface AdminCustomerLicenseFormInput {
  readonly email: string;
  readonly tier: AdminCustomerTier;
  readonly status: AdminCustomerStatus;
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
