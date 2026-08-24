// Boundary parser internals decode SolidStart D1/drizzle rows.
//
// Convention: Effect is used internally for typed decoding; this module's
// exports cross the boundary as plain async functions returning tagged-union
// results (`present`/`missing`/`invalid`, `ok`/`invalid`) so callers never
// handle promises that reject or raw `unknown` rows.

import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { NullableStringSchema } from '../../../shared/d1-rows';

/** Raw value accepted only at a Schema-decoded D1 boundary. */
type D1BoundaryInput = Schema.Schema.Encoded<Schema.Schema.Any>;

/** A failure decoding a persisted D1/drizzle row. */
class D1RowParseError extends Error {
  readonly _tag = 'D1RowParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const D1Timestamp = Schema.Union(
  Schema.instanceOf(Date),
  Schema.Number.pipe(
    Schema.transform(Schema.instanceOf(Date), {
      decode: (fromA: number) => new Date(fromA),
      encode: (toI: Date) => toI.getTime(),
    })
  )
);

/** Decode a single D1/drizzle row. */
function decodeD1Row<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: D1BoundaryInput
): Effect.Effect<Schema.Schema.Type<S>, D1RowParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause: unknown): D1RowParseError => new D1RowParseError(reason, cause))
  );
}

/** Decode a drizzle `.all()` list. Missing becomes `[]`. A non-array fails. */
function decodeD1RowArray<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: D1BoundaryInput
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, D1RowParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed([]);
  }
  if (!Array.isArray(value)) {
    return Effect.fail(new D1RowParseError(reason));
  }
  const rows = Array.from(value);
  return Effect.forEach(rows, row => decodeD1Row(schema, reason, row));
}

/** Decode a drizzle `.get()` row. Missing stays missing. Malformed fails. */
function decodeOptionalD1Row<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: D1BoundaryInput
): Effect.Effect<Schema.Schema.Type<S> | undefined, D1RowParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed(undefined);
  }
  return decodeD1Row(schema, reason, value);
}

/** Outcome of reading an optional D1 `.get()` row. */
type OptionalD1Row<A> =
  | { readonly _tag: 'present'; readonly value: A }
  | { readonly _tag: 'missing' }
  | { readonly _tag: 'invalid' };

/** Read an optional D1 `.get()` row without treating malformed data as missing. */
export async function readOptionalD1Row<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: D1BoundaryInput
): Promise<OptionalD1Row<Schema.Schema.Type<S>>> {
  const exit = await Effect.runPromiseExit(decodeOptionalD1Row(schema, reason, value));
  if (Exit.isFailure(exit)) {
    return { _tag: 'invalid' };
  }
  if (exit.value === undefined) {
    return { _tag: 'missing' };
  }
  return { _tag: 'present', value: exit.value };
}

/** Read a D1 `.all()` list. A non-array or any bad row is invalid. */
export async function readD1RowArray<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: D1BoundaryInput
): Promise<
  | { readonly _tag: 'ok'; readonly value: ReadonlyArray<Schema.Schema.Type<S>> }
  | { readonly _tag: 'invalid' }
> {
  const exit = await Effect.runPromiseExit(decodeD1RowArray(schema, reason, value));
  if (Exit.isFailure(exit)) {
    return { _tag: 'invalid' };
  }
  return { _tag: 'ok', value: exit.value };
}

/** The row value when present, otherwise undefined. */
export function optionalD1RowValue<A>(row: OptionalD1Row<A>): A | undefined {
  return row._tag === 'present' ? row.value : undefined;
}

/** Whether an optional-row outcome is a malformed persisted row. */
export function isInvalidD1Row(row: OptionalD1Row<unknown>): row is { readonly _tag: 'invalid' } {
  return row._tag === 'invalid';
}

// Shared aggregate/id primitives live in site/shared/d1-rows.ts.
export { CountRowSchema } from '../../../shared/d1-rows';

/** Customer role lookup row. */
export const UserRoleRowSchema = Schema.Struct({
  role: Schema.Union(Schema.Literal('user'), Schema.Literal('admin')),
});
/** Session row used by the account dashboard. */
export const SessionRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  token: Schema.String,
  ipAddress: Schema.optional(NullableStringSchema),
  userAgent: Schema.optional(NullableStringSchema),
  createdAt: D1Timestamp,
  expiresAt: D1Timestamp,
});
/** OAuth/account row used by the account dashboard. */
export const AccountRowSchema = Schema.Struct({
  providerId: Schema.String,
  accountId: Schema.String,
});
