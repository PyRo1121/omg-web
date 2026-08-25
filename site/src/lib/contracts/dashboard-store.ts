// Boundary parser internals intentionally inspect unknown persisted state.

import * as Schema from 'effect/Schema';

const DateRangeSchema = Schema.Literal('7d', '30d', '90d', 'custom');
const AdminTabSchema = Schema.Literal(
  'overview',
  'crm',
  'analytics',
  'insights',
  'revenue',
  'audit'
);

const PersistedDashboardStateSchema = Schema.Struct({
  version: Schema.Literal(1),
  state: Schema.Struct({
    navigation: Schema.Struct({ activeTab: AdminTabSchema }),
    filters: Schema.Struct({
      dateRange: DateRangeSchema,
      segment: Schema.String,
      compareEnabled: Schema.Boolean,
    }),
    views: Schema.Struct({
      saved: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          tab: AdminTabSchema,
          dateRange: DateRangeSchema,
          segment: Schema.String,
          compareEnabled: Schema.Boolean,
        })
      ),
    }),
    crm: Schema.Struct({
      viewMode: Schema.Literal('cards', 'table'),
    }),
  }),
});

export type PersistedDashboardState = Schema.Schema.Type<typeof PersistedDashboardStateSchema>;

/** Decode persisted dashboard state read from localStorage. */
export function decodePersistedDashboardState(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): PersistedDashboardState | null {
  const decoded = Schema.decodeUnknownEither(PersistedDashboardStateSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
