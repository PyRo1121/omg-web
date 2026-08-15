import { Component, For, Show, createSignal, createMemo, createEffect, JSX } from 'solid-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Download,
  Settings2,
  Check,
  Square,
  CheckSquare,
  X,
} from 'lucide-solid';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => unknown);
  width?: string | number;
  minWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  hidden?: boolean;
  align?: 'left' | 'center' | 'right';
  cell?: (value: unknown, row: T) => JSX.Element;
  groupable?: boolean;
}

export interface ColumnConfig {
  id: string;
  visible: boolean;
  width?: number;
}

export interface DrilldownTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyField: keyof T;
  expandedContent?: (row: T) => JSX.Element;
  onRowClick?: (row: T) => void;
  onSelectionChange?: (selected: T[]) => void;
  onExport?: (format: 'csv' | 'json', data: T[]) => void;
  onColumnConfigChange?: (config: ColumnConfig[]) => void;
  initialColumnConfig?: ColumnConfig[];
  pageSize?: number;
  pageSizeOptions?: number[];
  bulkActions?: { label: string; icon?: JSX.Element; action: (selected: T[]) => void }[];
  loading?: boolean;
  emptyMessage?: string;
  class?: string;
}

interface FilterState {
  columnId: string;
  value: string;
}

const Checkbox: Component<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  'aria-label'?: string;
}> = props => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.indeterminate ? 'mixed' : props.checked}
      aria-label={props['aria-label']}
      class={cn(
        'flex h-4 w-4 items-center justify-center rounded',
        'transition-all duration-300',
        'border',
        props.checked || props.indeterminate
          ? 'border-indigo-500 bg-indigo-500'
          : 'border-nebula-600 hover:border-nebula-400 bg-transparent'
      )}
      onClick={() => props.onChange(!props.checked)}
    >
      <Show when={props.checked}>
        <Check size={10} class="text-white" />
      </Show>
      <Show when={props.indeterminate && !props.checked}>
        <div class="h-0.5 w-2 rounded bg-white" />
      </Show>
    </button>
  );
};

const ColumnFilter: Component<{
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}> = props => {
  return (
    <div
      class="bg-void-850 absolute top-full left-0 z-50 mt-1 min-w-[200px] rounded-xl border border-white/10 p-3 shadow-xl"
      onClick={e => e.stopPropagation()}
    >
      <div class="flex items-center gap-2">
        <input
          type="text"
          value={props.value}
          onInput={e => props.onChange(e.currentTarget.value)}
          placeholder="Filter..."
          class={cn(
            'flex-1 rounded-lg px-3 py-2 text-sm',
            'bg-void-900 border border-white/10',
            'placeholder:text-nebula-600 text-white',
            'focus:ring-2 focus:ring-indigo-500/30 focus:outline-none'
          )}
          autofocus
        />
        <button
          type="button"
          class="text-nebula-500 rounded-lg p-2 transition-colors duration-300 hover:bg-white/5 hover:text-white"
          onClick={props.onClose}
          aria-label="Close filter"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const ColumnConfigPanel: Component<{
  columns: ColumnDef<unknown>[];
  config: ColumnConfig[];
  onConfigChange: (config: ColumnConfig[]) => void;
  onClose: () => void;
}> = props => {
  const toggleColumn = (columnId: string) => {
    const newConfig = props.config.map(c =>
      c.id === columnId ? { ...c, visible: !c.visible } : c
    );
    props.onConfigChange(newConfig);
  };

  return (
    <div
      class="bg-void-850 absolute top-full right-0 z-50 mt-2 min-w-[200px] rounded-2xl border border-white/10 p-4 shadow-xl"
      onClick={e => e.stopPropagation()}
    >
      <div class="mb-3 flex items-center justify-between">
        <span class="text-nebula-500 text-xs font-bold tracking-widest uppercase">Columns</span>
        <button
          type="button"
          class="text-nebula-500 rounded p-1 transition-colors duration-300 hover:text-white"
          onClick={props.onClose}
          aria-label="Close column config"
        >
          <X size={14} />
        </button>
      </div>
      <div class="space-y-2">
        <For each={props.columns}>
          {col => {
            const config = () => props.config.find(c => c.id === col.id);
            return (
              <button
                type="button"
                class={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                  'transition-all duration-300',
                  config()?.visible !== false
                    ? 'bg-white/5 text-white'
                    : 'text-nebula-500 hover:bg-white/5'
                )}
                onClick={() => toggleColumn(col.id)}
              >
                <Show when={config()?.visible !== false} fallback={<Square size={14} />}>
                  <CheckSquare size={14} class="text-indigo-400" />
                </Show>
                <span>{col.header}</span>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export function DrilldownTable<T extends Record<string, unknown>>(props: DrilldownTableProps<T>) {
  const [sortColumn, setSortColumn] = createSignal<string | null>(null);
  const [sortDirection, setSortDirection] = createSignal<SortDirection>(null);
  const [selectedRows, setSelectedRows] = createSignal<Set<unknown>>(new Set());
  const [expandedRows, setExpandedRows] = createSignal<Set<unknown>>(new Set());
  const [filters, setFilters] = createSignal<FilterState[]>([]);
  const [activeFilter, setActiveFilter] = createSignal<string | null>(null);
  const [currentPage, setCurrentPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(props.pageSize || 10);
  const [showColumnConfig, setShowColumnConfig] = createSignal(false);
  const [columnConfig, setColumnConfig] = createSignal<ColumnConfig[]>(
    props.initialColumnConfig || props.columns.map(c => ({ id: c.id, visible: true }))
  );

  const pageSizeOptions = () => props.pageSizeOptions || [10, 25, 50, 100];

  const visibleColumns = createMemo(() =>
    props.columns.filter(col => {
      const config = columnConfig().find(c => c.id === col.id);
      return config?.visible !== false && !col.hidden;
    })
  );

  const getValue = (row: T, accessor: ColumnDef<T>['accessor']): unknown => {
    if (typeof accessor === 'function') {
      return accessor(row);
    }
    return row[accessor];
  };

  const filteredData = createMemo(() => {
    let data = [...props.data];

    for (const filter of filters()) {
      if (!filter.value) continue;
      const col = props.columns.find(c => c.id === filter.columnId);
      if (!col) continue;

      data = data.filter(row => {
        const value = getValue(row, col.accessor);
        return String(value).toLowerCase().includes(filter.value.toLowerCase());
      });
    }

    return data;
  });

  const sortedData = createMemo(() => {
    const data = [...filteredData()];
    const sortCol = sortColumn();
    const sortDir = sortDirection();

    if (!sortCol || !sortDir) return data;

    const col = props.columns.find(c => c.id === sortCol);
    if (!col) return data;

    return data.sort((a, b) => {
      const aVal = getValue(a, col.accessor);
      const bVal = getValue(b, col.accessor);

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDir === 'asc' ? comparison : -comparison;
    });
  });

  const totalPages = createMemo(() => Math.ceil(sortedData().length / pageSize()));

  const paginatedData = createMemo(() => {
    const start = (currentPage() - 1) * pageSize();
    return sortedData().slice(start, start + pageSize());
  });

  createEffect(() => {
    if (currentPage() > totalPages() && totalPages() > 0) {
      setCurrentPage(totalPages());
    }
  });

  createEffect(() => {
    const selected = Array.from(selectedRows())
      .map(key => props.data.find(row => row[props.keyField] === key))
      .filter((row): row is T => row !== undefined);
    props.onSelectionChange?.(selected);
  });

  const toggleSort = (columnId: string) => {
    if (sortColumn() === columnId) {
      if (sortDirection() === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection() === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnId);
      setSortDirection('asc');
    }
  };

  const toggleRowSelection = (key: unknown) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedRows().size === paginatedData().length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedData().map(row => row[props.keyField])));
    }
  };

  const toggleRowExpansion = (key: unknown) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const updateFilter = (columnId: string, value: string) => {
    setFilters(prev => {
      const existing = prev.find(f => f.columnId === columnId);
      if (existing) {
        return prev.map(f => (f.columnId === columnId ? { ...f, value } : f));
      }
      return [...prev, { columnId, value }];
    });
    setCurrentPage(1);
  };

  const handleExport = (format: 'csv' | 'json') => {
    const data =
      selectedRows().size > 0
        ? sortedData().filter(row => selectedRows().has(row[props.keyField]))
        : sortedData();
    props.onExport?.(format, data);
  };

  const isAllSelected = createMemo(
    () => paginatedData().length > 0 && selectedRows().size === paginatedData().length
  );

  const isSomeSelected = createMemo(
    () => selectedRows().size > 0 && selectedRows().size < paginatedData().length
  );

  return (
    <div class={cn('space-y-4', props.class)}>
      <div class="flex items-center justify-between gap-4">
        <Show when={selectedRows().size > 0 && props.bulkActions}>
          <div class="flex items-center gap-2">
            <span class="text-nebula-400 text-sm">{selectedRows().size} selected</span>
            <For each={props.bulkActions}>
              {action => (
                <button
                  type="button"
                  class={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                    'bg-void-800 text-nebula-300 border border-white/10',
                    'transition-all duration-300',
                    'hover:bg-white/5 hover:text-white'
                  )}
                  onClick={() => {
                    const selected = Array.from(selectedRows())
                      .map(key => props.data.find(row => row[props.keyField] === key))
                      .filter((row): row is T => row !== undefined);
                    action.action(selected);
                  }}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="ml-auto flex items-center gap-2">
          <Show when={props.onExport}>
            <div class="group relative">
              <button
                type="button"
                class={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                  'bg-void-800 text-nebula-400 border border-white/10',
                  'transition-all duration-300',
                  'hover:bg-white/5 hover:text-white'
                )}
              >
                <Download size={14} />
                <span>Export</span>
              </button>
              <div class="absolute top-full right-0 z-50 mt-1 hidden group-hover:block">
                <div class="bg-void-850 rounded-xl border border-white/10 p-2 shadow-xl">
                  <button
                    type="button"
                    class="text-nebula-300 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors duration-300 hover:bg-white/5 hover:text-white"
                    onClick={() => handleExport('csv')}
                  >
                    Export as CSV
                  </button>
                  <button
                    type="button"
                    class="text-nebula-300 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors duration-300 hover:bg-white/5 hover:text-white"
                    onClick={() => handleExport('json')}
                  >
                    Export as JSON
                  </button>
                </div>
              </div>
            </div>
          </Show>

          <div class="relative">
            <button
              type="button"
              class={cn(
                'rounded-xl p-2',
                'bg-void-800 text-nebula-400 border border-white/10',
                'transition-all duration-300',
                'hover:bg-white/5 hover:text-white',
                showColumnConfig() && 'bg-white/5 text-white'
              )}
              onClick={() => setShowColumnConfig(!showColumnConfig())}
              aria-label="Configure columns"
            >
              <Settings2 size={16} />
            </button>
            <Show when={showColumnConfig()}>
              <ColumnConfigPanel
                columns={props.columns as ColumnDef<unknown>[]}
                config={columnConfig()}
                onConfigChange={config => {
                  setColumnConfig(config);
                  props.onColumnConfigChange?.(config);
                }}
                onClose={() => setShowColumnConfig(false)}
              />
            </Show>
          </div>
        </div>
      </div>

      <div class="bg-void-900 relative overflow-hidden rounded-2xl border border-white/5">
        <div class="overflow-x-auto">
          <table class="w-full" role="grid">
            <thead>
              <tr class="bg-drilldown-header border-b border-white/5">
                <Show when={props.onSelectionChange}>
                  <th class="w-12 px-4 py-3">
                    <Checkbox
                      checked={isAllSelected()}
                      indeterminate={isSomeSelected()}
                      onChange={toggleAllSelection}
                      aria-label="Select all rows"
                    />
                  </th>
                </Show>
                <Show when={props.expandedContent}>
                  <th class="w-10 px-2 py-3" />
                </Show>
                <For each={visibleColumns()}>
                  {col => {
                    const isSorted = () => sortColumn() === col.id;
                    const currentFilter = () =>
                      filters().find(f => f.columnId === col.id)?.value || '';

                    return (
                      <th
                        class={cn(
                          'px-4 py-3 text-left',
                          col.align === 'center' && 'text-center',
                          col.align === 'right' && 'text-right'
                        )}
                        style={{
                          width: typeof col.width === 'number' ? `${col.width}px` : col.width,
                          'min-width': col.minWidth ? `${col.minWidth}px` : undefined,
                        }}
                      >
                        <div class="relative flex items-center gap-2">
                          <span class="text-nebula-500 text-xs font-bold tracking-widest uppercase">
                            {col.header}
                          </span>

                          <Show when={col.sortable !== false}>
                            <button
                              type="button"
                              class={cn(
                                'rounded p-1 transition-colors duration-300',
                                isSorted()
                                  ? 'text-indigo-400'
                                  : 'text-nebula-600 hover:text-nebula-400'
                              )}
                              onClick={() => toggleSort(col.id)}
                              aria-label={`Sort by ${col.header}`}
                            >
                              <Show when={!isSorted()}>
                                <ArrowUpDown size={12} />
                              </Show>
                              <Show when={isSorted() && sortDirection() === 'asc'}>
                                <ArrowUp size={12} />
                              </Show>
                              <Show when={isSorted() && sortDirection() === 'desc'}>
                                <ArrowDown size={12} />
                              </Show>
                            </button>
                          </Show>

                          <Show when={col.filterable !== false}>
                            <button
                              type="button"
                              class={cn(
                                'rounded p-1 transition-colors duration-300',
                                currentFilter()
                                  ? 'text-indigo-400'
                                  : 'text-nebula-600 hover:text-nebula-400'
                              )}
                              onClick={() =>
                                setActiveFilter(activeFilter() === col.id ? null : col.id)
                              }
                              aria-label={`Filter ${col.header}`}
                            >
                              <Filter size={12} />
                            </button>
                          </Show>

                          <Show when={activeFilter() === col.id}>
                            <ColumnFilter
                              value={currentFilter()}
                              onChange={value => updateFilter(col.id, value)}
                              onClose={() => setActiveFilter(null)}
                            />
                          </Show>
                        </div>
                      </th>
                    );
                  }}
                </For>
              </tr>
            </thead>
            <tbody>
              <Show when={props.loading}>
                <tr>
                  <td
                    colspan={
                      visibleColumns().length +
                      (props.onSelectionChange ? 1 : 0) +
                      (props.expandedContent ? 1 : 0)
                    }
                    class="px-4 py-12 text-center"
                  >
                    <div class="flex flex-col items-center gap-3">
                      <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                      <span class="text-nebula-500 text-sm">Loading...</span>
                    </div>
                  </td>
                </tr>
              </Show>

              <Show when={!props.loading && paginatedData().length === 0}>
                <tr>
                  <td
                    colspan={
                      visibleColumns().length +
                      (props.onSelectionChange ? 1 : 0) +
                      (props.expandedContent ? 1 : 0)
                    }
                    class="text-nebula-500 px-4 py-12 text-center"
                  >
                    {props.emptyMessage || 'No data available'}
                  </td>
                </tr>
              </Show>

              <Show when={!props.loading}>
                <For each={paginatedData()}>
                  {row => {
                    const rowKey = row[props.keyField];
                    const isSelected = () => selectedRows().has(rowKey);
                    const isExpanded = () => expandedRows().has(rowKey);

                    return (
                      <>
                        <tr
                          class={cn(
                            'border-b border-white/5 transition-colors duration-300',
                            'hover:bg-drilldown-row-hover',
                            isSelected() && 'bg-drilldown-selection',
                            props.onRowClick && 'cursor-pointer'
                          )}
                          onClick={() => props.onRowClick?.(row)}
                        >
                          <Show when={props.onSelectionChange}>
                            <td class="w-12 px-4 py-3" onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected()}
                                onChange={() => toggleRowSelection(rowKey)}
                                aria-label={`Select row ${rowKey}`}
                              />
                            </td>
                          </Show>
                          <Show when={props.expandedContent}>
                            <td class="w-10 px-2 py-3" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                class={cn(
                                  'rounded p-1 transition-all duration-300',
                                  'text-nebula-500 hover:bg-white/5 hover:text-white'
                                )}
                                onClick={() => toggleRowExpansion(rowKey)}
                                aria-expanded={isExpanded()}
                                aria-label={isExpanded() ? 'Collapse row' : 'Expand row'}
                              >
                                <Show when={isExpanded()} fallback={<ChevronRight size={14} />}>
                                  <ChevronDown size={14} />
                                </Show>
                              </button>
                            </td>
                          </Show>
                          <For each={visibleColumns()}>
                            {col => {
                              const value = getValue(row, col.accessor);
                              return (
                                <td
                                  class={cn(
                                    'px-4 py-3 text-sm',
                                    col.align === 'center' && 'text-center',
                                    col.align === 'right' && 'text-right',
                                    'text-nebula-200 font-mono'
                                  )}
                                >
                                  {col.cell ? col.cell(value, row) : String(value ?? '—')}
                                </td>
                              );
                            }}
                          </For>
                        </tr>
                        <Show when={isExpanded() && props.expandedContent}>
                          <tr class="bg-drilldown-expanded">
                            <td
                              colspan={
                                visibleColumns().length +
                                (props.onSelectionChange ? 1 : 0) +
                                (props.expandedContent ? 1 : 0)
                              }
                              class="px-6 py-4"
                            >
                              {props.expandedContent!(row)}
                            </td>
                          </tr>
                        </Show>
                      </>
                    );
                  }}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-nebula-500 text-sm">Rows per page:</span>
          <select
            value={pageSize()}
            onChange={e => {
              setPageSize(parseInt(e.currentTarget.value));
              setCurrentPage(1);
            }}
            class={cn(
              'rounded-lg px-2 py-1 text-sm',
              'bg-void-800 border border-white/10 text-white',
              'focus:ring-2 focus:ring-indigo-500/30 focus:outline-none'
            )}
          >
            <For each={pageSizeOptions()}>{size => <option value={size}>{size}</option>}</For>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-nebula-500 text-sm tabular-nums">
            {(currentPage() - 1) * pageSize() + 1}–
            {Math.min(currentPage() * pageSize(), sortedData().length)} of {sortedData().length}
          </span>

          <div class="flex items-center gap-1">
            <button
              type="button"
              class={cn(
                'rounded-lg p-1.5 transition-all duration-300',
                'text-nebula-500 hover:bg-white/5 hover:text-white',
                'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'
              )}
              disabled={currentPage() === 1}
              onClick={() => setCurrentPage(1)}
              aria-label="First page"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              class={cn(
                'rounded-lg p-1.5 transition-all duration-300',
                'text-nebula-500 hover:bg-white/5 hover:text-white',
                'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'
              )}
              disabled={currentPage() === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span class="px-3 font-mono text-sm text-white tabular-nums">
              {currentPage()} / {totalPages() || 1}
            </span>
            <button
              type="button"
              class={cn(
                'rounded-lg p-1.5 transition-all duration-300',
                'text-nebula-500 hover:bg-white/5 hover:text-white',
                'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'
              )}
              disabled={currentPage() >= totalPages()}
              onClick={() => setCurrentPage(p => Math.min(totalPages(), p + 1))}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              class={cn(
                'rounded-lg p-1.5 transition-all duration-300',
                'text-nebula-500 hover:bg-white/5 hover:text-white',
                'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'
              )}
              disabled={currentPage() >= totalPages()}
              onClick={() => setCurrentPage(totalPages())}
              aria-label="Last page"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DrilldownTable;
