import type { Component} from 'solid-js';
import { For, Show, createSignal } from 'solid-js';
import type {
  ColumnDef,
  SortingState,
  RowSelectionState} from '@tanstack/solid-table';
import {
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel
} from '@tanstack/solid-table';
import * as api from '../../../lib/api';
import { ChevronUp, ChevronDown, Trash2, Monitor, Search, X } from '../../ui/Icons';
import { StatusBadge } from '../../ui/Badge';

interface FleetTableProps {
  data: api.Machine[];
  onRevoke: (ids: string[]) => void;
}

export const FleetTable: Component<FleetTableProps> = props => {
  const [sorting, setSorting] = createSignal<SortingState>([]);
  const [rowSelection, setRowSelection] = createSignal<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = createSignal('');

  const columns: ColumnDef<api.Machine>[] = [
    {
      id: 'select',
      header: (tableProps) => (
        <div class="px-1">
          <input
            type="checkbox"
            class="rounded border-white/10 bg-white/5 text-blue-500 focus:ring-blue-500/20"
            checked={tableProps.table.getIsAllRowsSelected()}
            ref={el => {
              if (el) {el.indeterminate = tableProps.table.getIsSomeRowsSelected();}
            }}
            onChange={tableProps.table.getToggleAllRowsSelectedHandler()}
          />
        </div>
      ),
      cell: (cellProps) => (
        <div class="px-1">
          <input
            type="checkbox"
            class="rounded border-white/10 bg-white/5 text-blue-500 focus:ring-blue-500/20"
            checked={cellProps.row.getIsSelected()}
            disabled={!cellProps.row.getCanSelect()}
            onChange={cellProps.row.getToggleSelectedHandler()}
          />
        </div>
      ),
    },
    {
      accessorKey: 'hostname',
      header: 'Hostname',
      cell: info => (
        <div class="flex items-center gap-3">
          <div class="rounded-lg bg-white/5 p-2 text-slate-400">
            <Monitor size={16} />
          </div>
          <span class="font-bold text-white">{info.getValue<string>() || 'Unknown'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'os',
      header: 'OS / Arch',
      cell: info => (
        <div class="flex flex-col">
          <span class="text-sm text-slate-300">{info.getValue<string>() || 'Unknown'}</span>
          <span class="font-mono text-[10px] text-slate-500 uppercase">
            {info.row.original.arch || 'x64'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'omg_version',
      header: 'Version',
      cell: info => (
        <span class="rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 font-mono text-xs text-indigo-400">
          v{info.getValue<string>() || '0.0.0'}
        </span>
      ),
    },
    {
      accessorKey: 'last_seen_at',
      header: 'Status',
      cell: info => {
        const lastSeen = new Date(info.getValue<string>());
        const diffMs = new Date().getTime() - lastSeen.getTime();
        const isOnline = diffMs < 300000; // 5 mins

        // Map status based on activity and potentially other flags
        // For now using is_active from original data if available
        let status = isOnline ? 'Active' : 'Offline';
        if (info.row.original.is_active === 0) {status = 'Compromised';} // Example mapping

        return (
          <div class="flex flex-col gap-1">
            <StatusBadge status={status} pulse={isOnline} />
            <span class="ml-1 text-[10px] text-slate-500">
              {api.formatRelativeTime(info.getValue<string>())}
            </span>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: info => (
        <button
          onClick={() => props.onRevoke([info.row.original.machine_id])}
          class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
        >
          <Trash2 size={18} />
        </button>
      ),
    },
  ];

  const table = createSolidTable({
    get data() {
      return props.data;
    },
    columns,
    state: {
      get sorting() {
        return sorting();
      },
      get rowSelection() {
        return rowSelection();
      },
      get globalFilter() {
        return globalFilter();
      },
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const selectedCount = () => Object.keys(rowSelection()).length;

  const handleBulkRevoke = () => {
    const selectedIds = table.getSelectedRowModel().rows.map(row => row.original.machine_id);
    props.onRevoke(selectedIds);
    setRowSelection({});
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <div class="relative max-w-sm flex-1">
          <Search class="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            value={globalFilter()}
            onInput={e => setGlobalFilter(e.currentTarget.value)}
            placeholder="Search machines..."
            class="w-full rounded-xl border border-white/10 bg-white/5 py-2 pr-4 pl-10 text-sm text-white transition-all placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          />
          <Show when={globalFilter()}>
            <button
              onClick={() => setGlobalFilter('')}
              class="absolute top-1/2 right-3 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X size={14} />
            </button>
          </Show>
        </div>

        <Show when={selectedCount() > 0}>
          <button
            onClick={handleBulkRevoke}
            class="animate-in fade-in slide-in-from-right-4 flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-400 transition-all hover:bg-rose-500/20"
          >
            <Trash2 size={16} />
            Revoke Selected ({selectedCount()})
          </button>
        </Show>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-white/5 bg-white/[0.02]">
        <table class="w-full border-collapse text-left">
          <thead>
            <For each={table.getHeaderGroups()}>
              {headerGroup => (
                <tr class="border-b border-white/5 bg-white/[0.02]">
                  <For each={headerGroup.headers}>
                    {header => (
                      <th class="px-6 py-4 text-[10px] font-black tracking-widest text-slate-500 uppercase">
                        <Show when={!header.isPlaceholder} fallback={null}>
                          <div
                            class={
                              header.column.getCanSort()
                                ? 'flex cursor-pointer items-center gap-2 transition-colors select-none hover:text-white'
                                : ''
                            }
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <Show when={header.column.getIsSorted()}>
                              {header.column.getIsSorted() === 'asc' ? (
                                <ChevronUp size={12} />
                              ) : (
                                <ChevronDown size={12} />
                              )}
                            </Show>
                          </div>
                        </Show>
                      </th>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </thead>
          <tbody>
            <For each={table.getRowModel().rows}>
              {row => (
                <tr
                  class={`group border-b border-white/5 transition-colors hover:bg-white/[0.01] ${row.getIsSelected() ? 'bg-blue-500/[0.03]' : ''}`}
                >
                  <For each={row.getVisibleCells()}>
                    {cell => (
                      <td class="px-6 py-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between px-2">
        <div class="flex items-center gap-2">
          <button
            class="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-bold text-white transition-all hover:bg-white/[0.08] disabled:opacity-30"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </button>
          <button
            class="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-bold text-white transition-all hover:bg-white/[0.08] disabled:opacity-30"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </button>
        </div>
        <div class="text-[10px] font-black tracking-widest text-slate-500 uppercase">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
      </div>
    </div>
  );
};
