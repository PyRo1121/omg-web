import { Component, createSignal, Show } from 'solid-js';
import { AlertCircle, RefreshCw } from '../ui/Icons';
import { useFleetStatus } from '../../lib/api-hooks';
import { FleetTable } from './tables/FleetTable';
import * as api from '../../lib/api';

interface MachinesViewProps {
  machines: api.Machine[];
  onRevoke: () => void;
}

export const MachinesView: Component<MachinesViewProps> = props => {
  const fleetQuery = useFleetStatus();
  const [error, setError] = createSignal<string | null>(null);

  const handleRevoke = async (machineIds: string[]) => {
    const isBulk = machineIds.length > 1;
    const message = isBulk
      ? `Are you sure you want to revoke access for ${machineIds.length} machines?`
      : 'Are you sure you want to revoke access for this machine?';

    if (!confirm(message)) {
      return;
    }

    try {
      setError(null);
      // Execute all revocations in parallel
      const results = await Promise.all(machineIds.map(id => api.revokeMachine(id)));

      const allSuccessful = results.every(res => res.success);

      if (allSuccessful) {
        fleetQuery.refetch();
        props.onRevoke();
      } else {
        const failedCount = results.filter(res => !res.success).length;
        setError(`Failed to revoke ${failedCount} machine(s)`);
        fleetQuery.refetch();
      }
    } catch (_e) {
      setError('Network error during revocation');
    }
  };

  return (
    <div class="animate-fade-in space-y-6">
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h2 class="mb-2 text-2xl font-bold text-white">Connected Machines</h2>
          <p class="text-slate-400">Manage access for your CLI installations.</p>
        </div>
        <div class="flex items-center gap-4">
          <button
            onClick={() => fleetQuery.refetch()}
            class="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition-all hover:text-white"
            title="Refresh Fleet"
          >
            <RefreshCw size={18} class={fleetQuery.isFetching ? 'animate-spin' : ''} />
          </button>
          <div class="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 font-mono text-sm text-blue-400">
            {fleetQuery.data?.length || 0} Active
          </div>
        </div>
      </div>

      <Show when={error() || fleetQuery.error}>
        <div class="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertCircle class="h-5 w-5" />
          {error() || 'Failed to load fleet data'}
        </div>
      </Show>

      <Show when={fleetQuery.isLoading}>
        <div class="flex items-center justify-center py-20">
          <div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      </Show>

      <Show when={fleetQuery.isSuccess}>
        <FleetTable data={fleetQuery.data || []} onRevoke={handleRevoke} />
      </Show>
    </div>
  );
};
