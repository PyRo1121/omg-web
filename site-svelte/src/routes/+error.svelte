<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Page not found' : 'Request failed'} - OMG Package Manager</title>
  <meta name="description" content="The requested OMG page could not be loaded." />
  <meta name="robots" content="noindex, follow" />
</svelte:head>

<main id="main-content" class="error-shell">
  <p class="page-kicker">{page.status}</p>
  <h1 class="error-title">
    {page.status === 404 ? 'This page does not exist.' : 'This request did not complete.'}
  </h1>
  <p class="error-copy">
    {page.status === 404
      ? 'The address may be mistyped or the page moved.'
      : 'Try the request again. If the problem continues, use the production site.'}
  </p>
  <nav class="error-links" aria-label="Recovery links">
    <a href="/">Back to shadow home</a>
    <a href="https://omg.latham.cloud/docs/">Read production docs</a>
  </nav>
</main>

<style>
  .error-shell {
    display: grid;
    min-height: 100vh;
    align-content: center;
    padding: clamp(1.5rem, 7vw, 7rem);
  }

  .error-title {
    max-width: 12ch;
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(3.5rem, 11vw, 9rem);
    font-weight: 650;
    letter-spacing: -0.065em;
    line-height: 0.86;
  }

  .error-copy {
    max-width: 42rem;
    margin: 2rem 0 0;
    color: var(--ink-muted);
    font-size: clamp(1rem, 2vw, 1.25rem);
  }

  .error-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    margin-top: 2rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .error-links a {
    text-decoration-color: var(--signal);
    text-decoration-thickness: 2px;
    text-underline-offset: 0.35rem;
  }
</style>
