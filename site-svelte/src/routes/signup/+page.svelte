<script lang="ts">
  import { SignupView } from '../../lib/signup-view.svelte';
  const view = new SignupView();
</script>

<svelte:head>
  <title>Sign up - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="signup-shell">
  <section class="signup-panel" aria-labelledby="signup-title">
    <p class="signup-kicker">New account</p>
    <h1 id="signup-title" class="signup-title">Bring your toolchain into focus.</h1>
    <p class="signup-copy">
      Create an account with a verified identity. No public password registration and no unverified
      inboxes.
    </p>

    <button
      type="button"
      class="signup-github"
      onclick={() => void view.github()}
      disabled={view.pending}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" class="signup-github-icon">
        <path
          fill="currentColor"
          d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
        />
      </svg>
      {view.pending ? 'Redirecting…' : 'Continue with GitHub'}
    </button>

    {#if view.error}
      <p role="alert" class="signup-error">{view.error}</p>
    {/if}

    <p class="signup-signin">
      Existing account?
      <a href="/login">Sign in</a>
    </p>

    <p class="signup-note">
      OAuth-only registration ensures every public account begins with a verified email address.
    </p>
  </section>
</main>

<style>
  .signup-shell {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: clamp(1.5rem, 7vw, 7rem);
  }

  .signup-panel {
    width: 100%;
    max-width: 26rem;
  }

  .signup-kicker {
    margin: 0 0 1rem;
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .signup-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 8vw, 4rem);
    font-weight: 650;
    letter-spacing: -0.065em;
    line-height: 0.9;
  }

  .signup-copy {
    margin: 1.25rem 0 2rem;
    color: var(--ink-muted);
  }

  .signup-github {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 0.9rem 1.25rem;
    border: 1px solid var(--rule-strong);
    background: transparent;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .signup-github:hover:not(:disabled) {
    border-color: var(--signal);
    color: var(--signal);
  }

  .signup-github:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .signup-github-icon {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
  }

  .signup-error {
    margin: 1.25rem 0 0;
    color: var(--danger);
    font-size: 0.875rem;
  }

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

  .signup-note {
    margin: 2rem 0 0;
    padding-top: 1.25rem;
    border-top: 1px solid var(--rule);
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.6;
  }
</style>
