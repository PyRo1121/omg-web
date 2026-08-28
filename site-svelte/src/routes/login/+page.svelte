<script lang="ts">
  import {
    MAX_LOGIN_EMAIL_CHARACTERS,
    MAX_LOGIN_PASSWORD_CHARACTERS,
  } from '../../../../site/shared/login-credentials';
  import GitHubMark from '../../lib/components/GitHubMark.svelte';
  import { LoginView } from '../../lib/login-view.svelte';
  const view = new LoginView();
</script>

<svelte:head>
  <title>Sign in - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel" aria-labelledby="login-title">
    <p class="page-kicker">Account access</p>
    <h1 id="login-title" class="account-title">Pick up where you left off.</h1>
    <p class="account-copy">
      Continue with a verified GitHub identity, or sign in to an existing controlled account.
    </p>

    <button
      type="button"
      class="github-auth-button"
      onclick={() => void view.github()}
      disabled={view.pending}
    >
      <GitHubMark />
      Continue with GitHub
    </button>

    <p class="login-divider"><span>existing account</span></p>

    <form onsubmit={event => void view.submit(event)} class="login-form">
      <label class="login-label" for="login-email">
        <span>Email address</span>
        <input
          id="login-email"
          type="email"
          bind:value={view.email}
          autocomplete="email"
          maxlength={MAX_LOGIN_EMAIL_CHARACTERS}
          required
          class="login-input"
        />
      </label>
      <label class="login-label" for="login-password">
        <span>Password</span>
        <input
          id="login-password"
          type="password"
          bind:value={view.password}
          autocomplete="current-password"
          maxlength={MAX_LOGIN_PASSWORD_CHARACTERS}
          required
          class="login-input"
        />
      </label>
      <button type="submit" class="login-submit" disabled={view.pending}>
        {view.pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>

    {#if view.error}
      <p role="alert" class="form-error">{view.error}</p>
    {/if}
  </section>
</main>

<style>
  .login-divider {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin: 2rem 0;
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.625rem;
    text-transform: uppercase;
  }

  .login-divider::before,
  .login-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--rule);
  }

  .login-form {
    display: grid;
    gap: 1.25rem;
  }

  .login-label {
    display: block;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .login-label span {
    display: block;
    margin-bottom: 0.5rem;
  }

  .login-input {
    width: 100%;
    padding: 0.8rem 1rem;
    border: 1px solid var(--rule-strong);
    background: transparent;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }

  .login-input:focus {
    border-color: var(--signal);
    outline: none;
  }

  .login-submit {
    padding: 0.9rem 1.25rem;
    border: 1px solid var(--signal);
    background: var(--signal);
    color: var(--signal-ink);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .login-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
