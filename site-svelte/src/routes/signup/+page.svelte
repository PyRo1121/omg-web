<script lang="ts">
  import GitHubMark from '../../lib/components/GitHubMark.svelte';
  import { SignupView } from '../../lib/signup-view.svelte';
  const view = new SignupView();
</script>

<svelte:head>
  <title>Sign up - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel" aria-labelledby="signup-title">
    <p class="page-kicker">New account</p>
    <h1 id="signup-title" class="account-title">Bring your toolchain into focus.</h1>
    <p class="account-copy">
      Create an account with a verified identity. No public password registration and no unverified
      inboxes.
    </p>

    <button
      type="button"
      class="github-auth-button"
      onclick={() => void view.github()}
      disabled={view.pending}
    >
      <GitHubMark />
      {view.pending ? 'Redirecting…' : 'Continue with GitHub'}
    </button>

    {#if view.error}
      <p role="alert" class="form-error">{view.error}</p>
    {/if}

    <p class="signup-signin">
      Existing account?
      <a href="/login">Sign in</a>
    </p>

    <p class="account-note">
      OAuth-only registration ensures every public account begins with a verified email address.
    </p>
  </section>
</main>

<style>
  .signup-signin {
    margin: 2rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .signup-signin a {
    margin-left: 0.35rem;
    color: var(--signal);
    font-weight: 600;
  }
</style>
