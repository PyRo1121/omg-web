import { createStore } from 'solid-js/store';
import { createEffect } from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import type { AdminTab, SavedView, DateRange } from '~/types';
import {
  decodePersistedDashboardState,
  type PersistedDashboardState,
} from '~/lib/contracts/dashboard-store';

export interface DashboardState {
  navigation: {
    activeTab: AdminTab;
  };
  filters: {
    dateRange: DateRange;
  };
  views: {
    saved: SavedView[];
    showSaveModal: boolean;
    newViewName: string;
  };
  ui: {
    exportMenuOpen: boolean;
    isExporting: boolean;
  };
  crm: {
    page: number;
    search: string;
    selectedUserId: string | null;
  };
}

const STORAGE_KEY = 'omg-dashboard-state';
const STORAGE_VERSION = 2;

function browserWindow(): Window | undefined {
  return 'window' in globalThis ? globalThis.window : undefined;
}

function mergePersisted(
  defaults: DashboardState,
  persisted: PersistedDashboardState['state']
): DashboardState {
  return {
    ...defaults,
    navigation: { activeTab: persisted.navigation.activeTab },
    filters: { dateRange: persisted.filters.dateRange },
    views: { ...defaults.views, saved: [...persisted.views.saved] },
  };
}

function getInitialState(): DashboardState {
  const win = browserWindow();
  if (!win) {
    return createDefaultState();
  }

  try {
    const stored = win.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultState();
    }

    const parsed: unknown = JSON.parse(stored);
    const persisted = decodePersistedDashboardState(parsed);
    if (!persisted) {
      return createDefaultState();
    }

    return mergePersisted(createDefaultState(), persisted.state);
  } catch {
    return createDefaultState();
  }
}

function createDefaultState(): DashboardState {
  return {
    navigation: {
      activeTab: 'overview',
    },
    filters: {
      dateRange: '30d',
    },
    views: {
      saved: [],
      showSaveModal: false,
      newViewName: '',
    },
    ui: {
      exportMenuOpen: false,
      isExporting: false,
    },
    crm: {
      page: 1,
      search: '',
      selectedUserId: null,
    },
  };
}

export function createDashboardStore() {
  const [state, setState] = createStore<DashboardState>(getInitialState());

  const persistableState = () => ({
    version: STORAGE_VERSION,
    state: {
      navigation: {
        activeTab: state.navigation.activeTab,
      },
      filters: state.filters,
      views: {
        saved: state.views.saved,
      },
    },
  });

  const win = browserWindow();
  if (win) {
    const debouncedPersist = debounce((snapshot: ReturnType<typeof persistableState>) => {
      try {
        win.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // Dashboard preferences are best-effort when browser storage is unavailable.
      }
    }, 500);

    createEffect(() => {
      debouncedPersist(persistableState());
    });
  }

  const actions = {
    setTab(tab: AdminTab) {
      setState('navigation', 'activeTab', tab);
    },

    setDateRange(dateRange: DateRange) {
      setState('filters', 'dateRange', dateRange);
    },

    saveView() {
      const viewName = state.views.newViewName.trim();
      if (!viewName) {
        return;
      }

      const newView: SavedView = {
        id: crypto.randomUUID(),
        name: viewName,
        tab: state.navigation.activeTab,
        dateRange: state.filters.dateRange,
      };

      setState('views', 'saved', prev => [...prev, newView]);
      setState('views', {
        showSaveModal: false,
        newViewName: '',
      });
    },

    loadView(view: SavedView) {
      setState('navigation', 'activeTab', view.tab);
      setState('filters', 'dateRange', view.dateRange);
    },

    showSaveViewModal() {
      setState('views', 'showSaveModal', true);
    },

    hideSaveViewModal() {
      setState('views', {
        showSaveModal: false,
        newViewName: '',
      });
    },

    setNewViewName(name: string) {
      setState('views', 'newViewName', name);
    },

    toggleExportMenu() {
      setState('ui', 'exportMenuOpen', prev => !prev);
    },

    closeExportMenu() {
      setState('ui', 'exportMenuOpen', false);
    },

    setExporting(isExporting: boolean) {
      setState('ui', 'isExporting', isExporting);
    },

    setCRMPage(page: number) {
      setState('crm', 'page', page);
    },

    setCRMSearch(search: string) {
      setState('crm', {
        search,
        page: 1,
      });
    },

    setSelectedUserId(userId: string | null) {
      setState('crm', 'selectedUserId', userId);
    },
  };

  return [state, actions] as const;
}
