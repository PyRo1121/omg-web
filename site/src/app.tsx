import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense, onMount } from 'solid-js';
import { MetaProvider } from '@solidjs/meta';
import { QueryClientProvider } from '@tanstack/solid-query';
import { queryClient } from './lib/query';
import { initAnalytics } from './lib/analytics-client';
import '@fontsource-variable/archivo/wght.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './app.css';

export default function App() {
  onMount(() => {
    initAnalytics();
  });

  return (
    <Router
      root={props => (
        <MetaProvider>
          <QueryClientProvider client={queryClient}>
            <Suspense fallback={<PageLoader />}>{props.children}</Suspense>
          </QueryClientProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}

function PageLoader() {
  return (
    <div class="grid min-h-screen place-items-center bg-[var(--paper)]" aria-label="Loading page">
      <span class="font-mono text-xs tracking-[0.08em] text-[var(--signal)]">OMG/ LOADING</span>
    </div>
  );
}
