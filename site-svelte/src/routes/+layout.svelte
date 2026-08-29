<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import SiteFooter from '../lib/components/SiteFooter.svelte';
  import SiteHeader from '../lib/components/SiteHeader.svelte';
  import { initAnalytics, trackAnalyticsNavigation } from '../lib/site-analytics.svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
  let isAdminRoute = $derived(page.url.pathname.startsWith('/admin'));

  afterNavigate(() => trackAnalyticsNavigation());
  $effect(() => {
    initAnalytics();
  });
</script>

<a class="skip-link" href="#main-content">Skip to content</a>
{#if !isAdminRoute}
  <SiteHeader />
{/if}
{@render children()}
{#if !isAdminRoute}
  <SiteFooter />
{/if}
