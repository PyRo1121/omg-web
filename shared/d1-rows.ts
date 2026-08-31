import * as Schema from 'effect/Schema';

/** A nullable string column. */
export const NullableStringSchema = Schema.Union(Schema.Null, Schema.String);

/** D1 INTEGER columns decode NULL as 0 for aggregate compatibility. */
export const D1Number = Schema.Union(Schema.Number, Schema.Null).pipe(
  Schema.transform(Schema.Number, {
    decode: (fromA: number | null) => (fromA === null ? 0 : fromA),
    encode: (toI: number) => toI,
  })
);

/** Id-only lookup row. */
export const IdRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
});

/** COUNT(*) aggregate. */
export const CountRowSchema = Schema.Struct({ count: D1Number });
