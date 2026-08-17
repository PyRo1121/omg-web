// Boundary parser internals intentionally inspect unknown persisted state.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get -- Safe JSON boundary parsing requires these operations.

import { Schema } from '@effect/schema';

/** The supported date range presets. */
export const DateRangeSchema = Schema.Union(
  Schema.Literal('7d'),
  Schema.Literal('30d'),
  Schema.Literal('90d'),
  Schema.Literal('custom')
);

/** The admin dashboard tabs. */
export const AdminTabSchema = Schema.Union(
  Schema.Literal('overview'),
  Schema.Literal('crm'),
  Schema.Literal('analytics'),
  Schema.Literal('insights'),
  Schema.Literal('revenue'),
  Schema.Literal('audit'),
  Schema.Literal('segments'),
  Schema.Literal('predictions')
);

/** A saved dashboard view. */
export const SavedViewSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  tab: AdminTabSchema,
  dateRange: DateRangeSchema,
  segment: Schema.String,
  compareEnabled: Schema.Boolean,
});

/** The persisted dashboard state envelope (versioned for forward compatibility). */
export const PersistedDashboardStateSchema = Schema.Struct({
  version: Schema.Literal(1),
  state: Schema.Struct({
    navigation: Schema.Struct({ activeTab: AdminTabSchema }),
    filters: Schema.Struct({
      dateRange: DateRangeSchema,
      segment: Schema.String,
      compareEnabled: Schema.Boolean,
    }),
    views: Schema.Struct({ saved: Schema.Array(SavedViewSchema) }),
    crm: Schema.Struct({
      viewMode: Schema.Union(Schema.Literal('cards'), Schema.Literal('table')),
    }),
  }),
});

export type PersistedDashboardState = Schema.Schema.Type<typeof PersistedDashboardStateSchema>;

/**
 * Decode persisted dashboard state read from localStorage.
 *
 * @param value - The raw parsed value stored under the dashboard state key.
 * @returns The typed persisted state, or `null` when the version or shape is invalid.
 */
export function decodePersistedDashboardState(value: unknown): PersistedDashboardState | null {
  const decoded = Schema.decodeUnknownEither(PersistedDashboardStateSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
