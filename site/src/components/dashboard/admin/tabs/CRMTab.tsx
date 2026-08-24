import { createColumnHelper, tableFeatures } from '@tanstack/table-core';
import { createTable } from '@tanstack/solid-table';
import { debounce } from '@solid-primitives/scheduled';
import { Mail, Search, Users } from 'lucide-solid';
import { type Component, createSignal, For, Show } from 'solid-js';
import { openMailComposer } from '~/lib/mailto';
import type { CRMCustomer } from '../../premium/types';
import ErrorCard from '../shared/ErrorCard';

interface CRMTabProps {
  customers: CRMCustomer[];
  pagination: { total: number; pages: number; page: number; limit: number } | undefined;
  isLoading: boolean;
  isSuccess: boolean;
  isError?: boolean;
  onSearchChange: (search: string) => void;
  onPageChange: (page: number) => void;
  onViewDetail: (customerId: string) => void;
  onRetry?: () => void;
}

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, CRMCustomer>();

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));

const statusClass = (status: CRMCustomer['status']): string => {
  if (status === 'active') {
    return 'text-emerald-700';
  }
  if (status === 'suspended') {
    return 'text-amber-700';
  }
  return 'text-red-700';
};

const responsiveColumnClass = (id: string): string => {
  if (id === 'machines' || id === 'commands' || id === 'joined') {
    return 'hidden lg:table-cell';
  }
  if (id === 'health') {
    return 'hidden md:table-cell';
  }
  return '';
};

export const CRMTab: Component<CRMTabProps> = props => {
  const [search, setSearch] = createSignal('');
  const debouncedSearch = debounce((value: string) => props.onSearchChange(value), 300);

  const columns = columnHelper.columns([
    columnHelper.accessor('email', {
      header: 'Customer',
      cell: context => (
        <button
          type="button"
          class="max-w-64 text-left hover:text-[var(--signal)]"
          onClick={() => props.onViewDetail(context.row.original.id)}
        >
          <strong class="block truncate font-sans text-sm">{context.getValue()}</strong>
          <span class="mt-1 block truncate text-[10px] text-[var(--ink-muted)]">
            {context.row.original.company ?? context.row.original.id}
          </span>
        </button>
      ),
    }),
    columnHelper.accessor('tier', {
      header: 'Tier',
      cell: context => <span class="uppercase">{context.getValue()}</span>,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: context => (
        <span class={`font-semibold uppercase ${statusClass(context.getValue())}`}>
          {context.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor(customer => customer.health.overall_score, {
      id: 'health',
      header: 'Health',
      cell: context => <data value={context.getValue()}>{context.getValue()} / 100</data>,
    }),
    columnHelper.accessor('machine_count', {
      id: 'machines',
      header: 'Machines',
    }),
    columnHelper.accessor('total_commands', {
      id: 'commands',
      header: 'Commands',
      cell: context => context.getValue().toLocaleString(),
    }),
    columnHelper.accessor('created_at', {
      id: 'joined',
      header: 'Joined',
      cell: context => <time dateTime={context.getValue()}>{formatDate(context.getValue())}</time>,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Action',
      cell: context => (
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="manifest-button min-h-0 px-2 py-2"
            onClick={() => openMailComposer(context.row.original.email)}
            aria-label={`Email ${context.row.original.email}`}
          >
            <Mail size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            class="manifest-button min-h-0 px-3 py-2"
            onClick={() => props.onViewDetail(context.row.original.id)}
          >
            Inspect
          </button>
        </div>
      ),
    }),
  ]);

  const table = createTable({
    features,
    columns,
    get data() {
      return props.customers;
    },
  });

  const handleSearchInput = (value: string): void => {
    setSearch(value);
    debouncedSearch(value);
  };

  return (
    <section aria-labelledby="crm-title">
      <header class="grid gap-6 border-b border-[var(--ink)] pb-6 md:grid-cols-[1fr_minmax(18rem,28rem)] md:items-end">
        <div>
          <p class="manifest-index">CUSTOMER INDEX</p>
          <h3 id="crm-title" class="mt-3 text-3xl font-black tracking-[-0.045em] uppercase">
            Accounts
          </h3>
          <p class="mt-2 font-mono text-xs text-[var(--ink-muted)]">
            {(props.pagination?.total ?? 0).toLocaleString()} records
          </p>
        </div>
        <label class="block">
          <span class="manifest-label mb-2 block text-[var(--ink-muted)]">Search accounts</span>
          <span class="relative block">
            <Search
              class="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]"
              size={16}
              strokeWidth={1.5}
            />
            <input
              type="search"
              value={search()}
              onInput={event => handleSearchInput(event.currentTarget.value)}
              placeholder="Email, company, or account ID"
              class="w-full border border-[var(--ink)] bg-[var(--paper-raised)] py-3 pr-4 pl-10 font-mono text-xs placeholder:text-[var(--ink-muted)]"
            />
          </span>
        </label>
      </header>

      <Show when={props.isLoading}>
        <div
          class="divide-y divide-[var(--rule)] border-x border-b border-[var(--ink)]"
          aria-label="Loading customers"
        >
          <For each={[1, 2, 3, 4, 5]}>
            {() => <div class="h-16 animate-pulse bg-[rgba(21,21,20,0.035)]" />}
          </For>
        </div>
      </Show>

      <Show when={props.isError}>
        <ErrorCard
          title="Failed to load customers"
          message="Customer data is unavailable. Check the connection and try again."
          onRetry={props.onRetry}
        />
      </Show>

      <Show when={props.isSuccess}>
        <div class="overflow-x-auto border-x border-b border-[var(--ink)] bg-[var(--paper-raised)]">
          <table class="w-full min-w-[44rem] border-collapse text-left font-mono text-xs">
            <thead>
              <For each={table.getHeaderGroups()}>
                {group => (
                  <tr class="border-b border-[var(--ink)]">
                    <For each={group.headers}>
                      {header => (
                        <th
                          scope="col"
                          class={`p-4 text-[10px] font-semibold tracking-[0.09em] text-[var(--ink-muted)] uppercase ${responsiveColumnClass(header.column.id)}`}
                        >
                          <table.FlexRender header={header} />
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
                  <tr class="border-b border-[var(--rule)] last:border-b-0 hover:bg-[var(--paper-muted)]">
                    <For each={row.getAllCells()}>
                      {cell => (
                        <td class={`p-4 align-middle ${responsiveColumnClass(cell.column.id)}`}>
                          <table.FlexRender cell={cell} />
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>

          <Show when={props.customers.length === 0}>
            <div class="grid min-h-64 place-items-center border-t border-[var(--rule)] text-center">
              <div>
                <Users size={28} strokeWidth={1.25} class="mx-auto text-[var(--ink-muted)]" />
                <p class="mt-4 font-medium">No customers found</p>
                <p class="mt-1 font-mono text-xs text-[var(--ink-muted)]">
                  {search() ? 'Change the search query.' : 'Customer records will appear here.'}
                </p>
              </div>
            </div>
          </Show>

          <Show when={(props.pagination?.pages ?? 1) > 1}>
            <footer class="flex items-center justify-between border-t border-[var(--ink)] p-4">
              <p class="font-mono text-xs text-[var(--ink-muted)]">
                Page {props.pagination?.page ?? 1} / {props.pagination?.pages ?? 1}
              </p>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="manifest-button"
                  disabled={(props.pagination?.page ?? 1) === 1}
                  onClick={() => props.onPageChange(Math.max(1, (props.pagination?.page ?? 1) - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  class="manifest-button"
                  disabled={(props.pagination?.page ?? 1) === (props.pagination?.pages ?? 1)}
                  onClick={() =>
                    props.onPageChange(
                      Math.min(props.pagination?.pages ?? 1, (props.pagination?.page ?? 1) + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </footer>
          </Show>
        </div>
      </Show>
    </section>
  );
};
