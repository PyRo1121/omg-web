import { describe, expect, it } from 'vitest';
import { decodePersistedDashboardState } from './dashboard-store';

const validCurrent = {
  version: 2,
  state: {
    navigation: { activeTab: 'analytics' },
    filters: { dateRange: '90d' },
    views: {
      saved: [
        {
          id: 'view-1',
          name: 'Analytics month',
          tab: 'analytics',
          dateRange: '30d',
        },
      ],
    },
  },
};

const legacyPersisted = {
  version: 1,
  state: {
    navigation: { activeTab: 'insights' },
    filters: { dateRange: 'custom', segment: 'enterprise', compareEnabled: true },
    views: {
      saved: [
        {
          id: 'legacy-view',
          name: 'Legacy custom view',
          tab: 'insights',
          dateRange: 'custom',
          segment: 'enterprise',
          compareEnabled: false,
        },
      ],
    },
    crm: { viewMode: 'cards' },
  },
};

describe('decodePersistedDashboardState', () => {
  it('decodes current version-2 preferences', () => {
    const decoded = decodePersistedDashboardState(validCurrent);

    expect(decoded).toEqual(validCurrent);
  });

  it('migrates version-1 saved views without preserving obsolete fake controls', () => {
    const decoded = decodePersistedDashboardState(legacyPersisted);

    expect(decoded).toEqual({
      version: 2,
      state: {
        navigation: { activeTab: 'insights' },
        filters: { dateRange: '30d' },
        views: {
          saved: [
            {
              id: 'legacy-view',
              name: 'Legacy custom view',
              tab: 'insights',
              dateRange: '30d',
            },
          ],
        },
      },
    });
  });

  it('rejects an unknown forward version', () => {
    expect(decodePersistedDashboardState({ ...validCurrent, version: 3 })).toBeNull();
  });

  it('rejects a state with an invalid tab value', () => {
    const malformed = {
      ...validCurrent,
      state: { ...validCurrent.state, navigation: { activeTab: 'billing' } },
    };
    expect(decodePersistedDashboardState(malformed)).toBeNull();
  });

  it('rejects a non-object payload', () => {
    expect(decodePersistedDashboardState('garbage')).toBeNull();
    expect(decodePersistedDashboardState(null)).toBeNull();
  });
});
