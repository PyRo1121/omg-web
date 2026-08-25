<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Page not found' : 'Request failed'} - OMG Package Manager</title>
  <meta name="description" content="The requested OMG page could not be loaded." />
  <meta name="robots" content="noindex, follow" />
</svelte:head>

<main id="main-content" class="shadow-shell">
  <p class="shadow-kicker">{page.status}</p>
  <h1 class="shadow-title">
    {page.status === 404 ? 'This page does not exist.' : 'This request did not complete.'}
  </h1>
  <p class="shadow-copy">
    {page.status === 404
      ? 'The address may be mistyped or the page moved.'
      : 'Try the request again. If the problem continues, use the production site.'}
  </p>
  <nav class="shadow-links" aria-label="Recovery links">
    <a href="/">Back to shadow home</a>
    <a href="https://omg.latham.cloud/docs/">Read production docs</a>
  </nav>
</main>
