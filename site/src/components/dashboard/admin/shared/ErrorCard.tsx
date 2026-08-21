import { CircleAlert, RefreshCw } from 'lucide-solid';

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: (() => void) | undefined;
  className?: string;
}

export default function ErrorCard(props: ErrorCardProps) {
  const title = () => props.title || 'Failed to Load Data';
  const message = () =>
    props.message || 'An error occurred while loading this data. Please try again.';

  return (
    <div
      class={`flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 p-8 ${props.className || ''}`}
    >
      <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
        <CircleAlert size={24} class="text-red-400" />
      </div>

      <h3 class="font-display mb-2 text-lg font-black tracking-tight text-red-400">{title()}</h3>

      <p class="text-nebula-400 mb-6 max-w-md text-center text-sm">{message()}</p>

      {props.onRetry && (
        <button
          onClick={props.onRetry}
          class="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 transition-all hover:bg-red-500/20"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}
