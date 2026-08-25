import * as Schema from 'effect/Schema';

/** Raw value accepted only at a Schema-decoded browser boundary. */
type BrowserBoundaryInput = Schema.Schema.Encoded<Schema.Schema.Any>;

/** A parsed localStorage cache of rendered GitHub activity bars. */
const NonEmptyString = Schema.String.pipe(Schema.minLength(1));
const ApiErrorSchema = Schema.Union(
  Schema.Struct({ error: NonEmptyString }),
  Schema.Struct({ message: NonEmptyString })
);

/** A successful or rejected parse at an HTTP boundary. */
type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function parseWithSchema<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  value: BrowserBoundaryInput,
  error: string
): ParseResult<Schema.Schema.Type<S>> {
  const decoded = Schema.decodeUnknownEither(schema)(value);
  return decoded._tag === 'Right' ? { ok: true, value: decoded.right } : { ok: false, error };
}

/** Extract a safe human-readable API error without trusting the response shape. */
export function parseApiError(value: BrowserBoundaryInput, fallback: string): string {
  const decoded = Schema.decodeUnknownEither(ApiErrorSchema)(value);
  if (decoded._tag === 'Left') {
    return fallback;
  }
  return 'error' in decoded.right ? decoded.right.error : decoded.right.message;
}

const CheckoutSessionStatusSchema = Schema.Struct({
  status: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(32)),
  email: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  license: Schema.optional(
    Schema.Union(
      Schema.Null,
      Schema.Struct({
        license_key: NonEmptyString,
        tier: NonEmptyString,
      })
    )
  ),
});

/** A parsed post-checkout fulfillment probe response. */
type CheckoutSessionStatus = Schema.Schema.Type<typeof CheckoutSessionStatusSchema>;

/** Parse the checkout-session fulfillment probe response. */
export function parseCheckoutSessionStatus(
  value: BrowserBoundaryInput
): ParseResult<CheckoutSessionStatus> {
  return parseWithSchema(
    CheckoutSessionStatusSchema,
    value,
    'Checkout session response has an invalid shape'
  );
}
