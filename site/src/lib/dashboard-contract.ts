import { Schema } from '@effect/schema';
import {
  decodeDashboardData,
  type DashboardData as ContractDashboardData,
} from './contracts/dashboard';

// Boundary parser internals intentionally inspect unknown JSON values and dynamic object fields.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get -- Safe JSON boundary parsing requires these operations.

/** Data returned by the authenticated account dashboard endpoint. */
export type DashboardData = ContractDashboardData;

/** A license lookup response used by the public landing page. */
export type LicenseLookup =
  | { readonly found: false }
  | { readonly found: true; readonly license_key: string; readonly tier: string };

/** A single weekly GitHub activity point. */
export interface GitHubActivityWeek {
  readonly week: number;
  readonly total: number;
}

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

/** The two response shapes returned while GitHub computes statistics. */
export interface GitHubComputingResponse {
  readonly computing: boolean;
  readonly message: string | undefined;
}

/** The two response shapes returned while GitHub computes statistics. */
export type GitHubActivityResponse = readonly GitHubActivityWeek[] | GitHubComputingResponse;

/** Inputs accepted by the admin CRM note endpoints. */
export interface AdminCrmNoteInput {
  readonly customerId?: string | undefined;
  readonly noteId?: string | undefined;
  readonly content?: string | undefined;
  readonly noteType?: string | undefined;
  readonly isPinned?: boolean | undefined;
}

/** Inputs accepted by the admin CRM tag endpoints. */
export interface AdminCrmTagInput {
  readonly customerId?: string | undefined;
  readonly tagId?: string | undefined;
  readonly name?: string | undefined;
  readonly color?: string | undefined;
  readonly description?: string | undefined;
}

/** A successful or rejected parse at an HTTP boundary. */
export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(value: object, name: string): unknown {
  return Reflect.get(value, name);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/**
 * Parse the account dashboard response at the network boundary.
 *
 * @param value - Untrusted JSON returned by the account endpoint.
 * @returns A typed payload or a safe parse failure.
 */
export function parseDashboardData(value: unknown): ParseResult<DashboardData> {
  const decoded = decodeDashboardData(value);
  return decoded
    ? { ok: true, value: decoded }
    : { ok: false, error: 'Dashboard response has an invalid shape' };
}

/**
 * Extract a safe human-readable API error without trusting the response shape.
 *
 * @param value - Untrusted JSON returned by an API.
 * @param fallback - Message used when the response has no usable error.
 * @returns A safe error message.
 */
export function parseApiError(value: unknown, fallback: string): string {
  if (!isObject(value)) {
    return fallback;
  }

  const error = field(value, 'error');
  if (isString(error) && error.length > 0) {
    return error;
  }

  const message = field(value, 'message');
  return isString(message) && message.length > 0 ? message : fallback;
}

/**
 * Parse a public license lookup response.
 *
 * @param value - Untrusted JSON returned by the licensing endpoint.
 * @returns A typed lookup response or a safe parse failure.
 */
export function parseLicenseLookup(value: unknown): ParseResult<LicenseLookup> {
  if (!isObject(value) || !isBoolean(field(value, 'found'))) {
    return { ok: false, error: 'License lookup response has an invalid shape' };
  }

  if (field(value, 'found') === false) {
    return { ok: true, value: { found: false } };
  }

  const licenseKey = field(value, 'license_key');
  const tier = field(value, 'tier');
  return isString(licenseKey) && isString(tier)
    ? { ok: true, value: { found: true, license_key: licenseKey, tier } }
    : { ok: false, error: 'License lookup response has an invalid license' };
}

/**
 * Parse GitHub commit activity or its temporary computing response.
 *
 * @param value - Untrusted JSON returned by the GitHub proxy.
 * @returns A typed response or a safe parse failure.
 */
export function parseGitHubActivity(value: unknown): ParseResult<GitHubActivityResponse> {
  if (
    isArrayOf(
      value,
      (item): item is GitHubActivityWeek =>
        isObject(item) &&
        isFiniteNumber(field(item, 'week')) &&
        isFiniteNumber(field(item, 'total'))
    )
  ) {
    return { ok: true, value };
  }

  if (!isObject(value) || !isBoolean(field(value, 'computing'))) {
    return { ok: false, error: 'GitHub activity response has an invalid shape' };
  }

  const computing = field(value, 'computing');
  const message = field(value, 'message');
  if (!isBoolean(computing)) {
    return { ok: false, error: 'GitHub activity response has an invalid computing flag' };
  }
  if (message !== undefined && !isString(message)) {
    return { ok: false, error: 'GitHub activity response has an invalid message' };
  }

  const response = {
    computing,
    message: isString(message) ? message : undefined,
  };
  return { ok: true, value: response };
}

/**
 * Parse a locally cached GitHub activity payload.
 *
 * @param value - Untrusted JSON from localStorage.
 * @returns A typed cache entry or a safe parse failure.
 */
export function parseGitHubActivityCache(value: unknown): ParseResult<GitHubActivityCache> {
  const decoded = Schema.decodeUnknownEither(GitHubActivityCacheSchema)(value);
  if (decoded._tag === 'Left') {
    return { ok: false, error: 'GitHub activity cache has an invalid shape' };
  }
  return { ok: true, value: decoded.right };
}

function optionalString(value: object, name: string): string | undefined {
  const candidate = field(value, name);
  if (candidate === undefined) {
    return undefined;
  }
  return isString(candidate) ? candidate : undefined;
}

/** Parse an admin CRM note request body. */
export function parseAdminCrmNoteInput(value: unknown): ParseResult<AdminCrmNoteInput> {
  if (!isObject(value)) {
    return { ok: false, error: 'Note request has an invalid shape' };
  }

  const isPinned = field(value, 'isPinned');
  if (isPinned !== undefined && !isBoolean(isPinned)) {
    return { ok: false, error: 'Note request has an invalid pinned flag' };
  }

  return {
    ok: true,
    value: {
      customerId: optionalString(value, 'customerId'),
      noteId: optionalString(value, 'noteId'),
      content: optionalString(value, 'content'),
      noteType: optionalString(value, 'noteType'),
      isPinned: isBoolean(isPinned) ? isPinned : undefined,
    },
  };
}

/** Parse an admin CRM tag request body. */
export function parseAdminCrmTagInput(value: unknown): ParseResult<AdminCrmTagInput> {
  if (!isObject(value)) {
    return { ok: false, error: 'Tag request has an invalid shape' };
  }

  return {
    ok: true,
    value: {
      customerId: optionalString(value, 'customerId'),
      tagId: optionalString(value, 'tagId'),
      name: optionalString(value, 'name'),
      color: optionalString(value, 'color'),
      description: optionalString(value, 'description'),
    },
  };
}
