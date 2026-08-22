import * as Schema from 'effect/Schema';

/** Raw value accepted only at a Schema-decoded browser boundary. */
type BrowserBoundaryInput = Schema.Schema.Encoded<Schema.Schema.Any>;

const LicenseLookupSchema = Schema.Union(
  Schema.Struct({ found: Schema.Literal(false) }),
  Schema.Struct({
    found: Schema.Literal(true),
    license_key: Schema.String,
    tier: Schema.String,
  })
);

/** A license lookup response used by the public landing page. */
export type LicenseLookup = Schema.Schema.Type<typeof LicenseLookupSchema>;

const GitHubActivityWeekSchema = Schema.Struct({
  week: Schema.Number.pipe(Schema.finite()),
  total: Schema.Number.pipe(Schema.finite()),
});

/** A single weekly GitHub activity point. */
export type GitHubActivityWeek = Schema.Schema.Type<typeof GitHubActivityWeekSchema>;

const GitHubActivityBarSchema = Schema.Struct({
  label: Schema.String,
  value: Schema.Number.pipe(Schema.finite()),
});

const GitHubActivityCacheSchema = Schema.Struct({
  data: Schema.Array(GitHubActivityBarSchema),
  total: Schema.Number.pipe(Schema.finite()),
  timestamp: Schema.Number.pipe(Schema.finite()),
});

/** A parsed localStorage cache of rendered GitHub activity bars. */
export type GitHubActivityCache = Schema.Schema.Type<typeof GitHubActivityCacheSchema>;

const GitHubComputingResponseSchema = Schema.Struct({
  computing: Schema.Boolean,
  message: Schema.optional(Schema.String),
});

/** Response returned while GitHub computes statistics. */
export type GitHubComputingResponse = Schema.Schema.Type<typeof GitHubComputingResponseSchema>;

const GitHubActivityResponseSchema = Schema.Union(
  Schema.Array(GitHubActivityWeekSchema),
  GitHubComputingResponseSchema
);

/** GitHub activity or its temporary computing response. */
export type GitHubActivityResponse = Schema.Schema.Type<typeof GitHubActivityResponseSchema>;

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));
const ApiErrorSchema = Schema.Union(
  Schema.Struct({ error: NonEmptyString }),
  Schema.Struct({ message: NonEmptyString })
);

/** A successful or rejected parse at an HTTP boundary. */
export type ParseResult<T> =
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

/** Parse a public license lookup response. */
export function parseLicenseLookup(value: BrowserBoundaryInput): ParseResult<LicenseLookup> {
  return parseWithSchema(
    LicenseLookupSchema,
    value,
    'License lookup response has an invalid shape'
  );
}

/** Parse GitHub commit activity or its temporary computing response. */
export function parseGitHubActivity(
  value: BrowserBoundaryInput
): ParseResult<GitHubActivityResponse> {
  return parseWithSchema(
    GitHubActivityResponseSchema,
    value,
    'GitHub activity response has an invalid shape'
  );
}

/** Parse a locally cached GitHub activity payload. */
export function parseGitHubActivityCache(
  value: BrowserBoundaryInput
): ParseResult<GitHubActivityCache> {
  return parseWithSchema(
    GitHubActivityCacheSchema,
    value,
    'GitHub activity cache has an invalid shape'
  );
}
