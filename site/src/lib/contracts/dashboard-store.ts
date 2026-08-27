// Boundary parser internals intentionally inspect unknown persisted state.

import * as Schema from 'effect/Schema';

const CurrentDateRangeSchema = Schema.Literal('7d', '30d', '90d');
const LegacyDateRangeSchema = Schema.Literal('7d', '30d', '90d', 'custom');
const AdminTabSchema = Schema.Literal(
  'overview',
  'crm',
  'analytics',
  'insights',
  'revenue',
  'audit'
);

const SavedViewId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64));
const SavedViewName = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64));

const CurrentSavedViewSchema = Schema.Struct({
  id: SavedViewId,
  name: SavedViewName,
  tab: AdminTabSchema,
  dateRange: CurrentDateRangeSchema,
});

const PersistedDashboardStateV2Schema = Schema.Struct({
  version: Schema.Literal(2),
  state: Schema.Struct({
    navigation: Schema.Struct({ activeTab: AdminTabSchema }),
    filters: Schema.Struct({ dateRange: CurrentDateRangeSchema }),
    views: Schema.Struct({
      saved: Schema.Array(CurrentSavedViewSchema).pipe(Schema.maxItems(50)),
    }),
  }),
});

const PersistedDashboardStateV1Schema = Schema.Struct({
  version: Schema.Literal(1),
  state: Schema.Struct({
    navigation: Schema.Struct({ activeTab: AdminTabSchema }),
    filters: Schema.Struct({
      dateRange: LegacyDateRangeSchema,
      segment: Schema.String.pipe(Schema.maxLength(64)),
      compareEnabled: Schema.Boolean,
    }),
    views: Schema.Struct({
      saved: Schema.Array(
        Schema.Struct({
          id: SavedViewId,
          name: SavedViewName,
          tab: AdminTabSchema,
          dateRange: LegacyDateRangeSchema,
          segment: Schema.String.pipe(Schema.maxLength(64)),
          compareEnabled: Schema.Boolean,
        })
      ).pipe(Schema.maxItems(50)),
    }),
    crm: Schema.Struct({ viewMode: Schema.Literal('cards', 'table') }),
  }),
});

export type PersistedDashboardState = Schema.Schema.Type<typeof PersistedDashboardStateV2Schema>;

type LegacyDateRange = Schema.Schema.Type<typeof LegacyDateRangeSchema>;
type CurrentDateRange = Schema.Schema.Type<typeof CurrentDateRangeSchema>;

function migrateDateRange(range: LegacyDateRange): CurrentDateRange {
  return range === 'custom' ? '30d' : range;
}

/** Decode current state or explicitly migrate the durable version-1 preferences. */
export function decodePersistedDashboardState(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): PersistedDashboardState | null {
  const current = Schema.decodeUnknownEither(PersistedDashboardStateV2Schema)(value);
  if (current._tag === 'Right') {
    return current.right;
  }

  const legacy = Schema.decodeUnknownEither(PersistedDashboardStateV1Schema)(value);
  if (legacy._tag === 'Left') {
    return null;
  }

  return {
    version: 2,
    state: {
      navigation: { activeTab: legacy.right.state.navigation.activeTab },
      filters: { dateRange: migrateDateRange(legacy.right.state.filters.dateRange) },
      views: {
        saved: legacy.right.state.views.saved.map(view => ({
          id: view.id,
          name: view.name,
          tab: view.tab,
          dateRange: migrateDateRange(view.dateRange),
        })),
      },
    },
  };
}
