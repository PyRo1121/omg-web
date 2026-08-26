<script lang="ts">
  import type { Snippet } from 'svelte';
  import SiteFooter from '../lib/components/SiteFooter.svelte';
  import SiteHeader from '../lib/components/SiteHeader.svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
</script>

<a class="skip-link" href="#main-content">Skip to content</a>
<SiteHeader />
{@render children()}
<SiteFooter />
