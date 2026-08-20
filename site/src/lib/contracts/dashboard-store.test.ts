import { describe, expect, it } from 'vitest';
import { decodePersistedDashboardState } from './dashboard-store';

const validPersisted = {
  version: 1,
  state: {
    navigation: { activeTab: 'analytics' },
    filters: { dateRange: '90d', segment: 'enterprise', compareEnabled: true },
    views: {
      saved: [
        {
          id: 'v1',
          name: 'Enterprise health',
          tab: 'insights',
          dateRange: '30d',
          segment: 'enterprise',
          compareEnabled: false,
        },
      ],
    },
    crm: { viewMode: 'cards' },
  },
};

describe('decodePersistedDashboardState', () => {
  it('decodes a valid persisted dashboard state', () => {
    const decoded = decodePersistedDashboardState(validPersisted);
    expect(decoded).not.toBeNull();
    expect(decoded?.state.navigation.activeTab).toBe('analytics');
    expect(decoded?.state.filters.dateRange).toBe('90d');
    expect(decoded?.state.views.saved.at(0)?.name).toBe('Enterprise health');
    expect(decoded?.state.crm.viewMode).toBe('cards');
  });

  it('rejects a state with an unknown version (forward-incompatible)', () => {
    const malformed = { ...validPersisted, version: 2 };
    expect(decodePersistedDashboardState(malformed)).toBeNull();
  });

  it('rejects a state with an invalid tab value', () => {
    const malformed = {
      ...validPersisted,
      state: { ...validPersisted.state, navigation: { activeTab: 'billing' } },
    };
    expect(decodePersistedDashboardState(malformed)).toBeNull();
  });

  it('rejects a non-object payload', () => {
    expect(decodePersistedDashboardState('garbage')).toBeNull();
    expect(decodePersistedDashboardState(null)).toBeNull();
  });
});
