<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import SiteFooter from '../lib/components/SiteFooter.svelte';
  import SiteHeader from '../lib/components/SiteHeader.svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
  let isAdminRoute = $derived(page.url.pathname.startsWith('/admin'));
</script>

<a class="skip-link" href="#main-content">Skip to content</a>
{#if !isAdminRoute}
  <SiteHeader />
{/if}
{@render children()}
{#if !isAdminRoute}
  <SiteFooter />
{/if}
