<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  const navigation = [
    { href: '/admin/', label: 'Command center', short: '01' },
    { href: '/admin/customers/', label: 'Customers', short: '02' },
  ] as const;

  function isCurrent(href: string): boolean {
    return href === '/admin/'
      ? page.url.pathname === '/admin/' || page.url.pathname === '/admin'
      : page.url.pathname.startsWith(href);
  }
</script>

<div class="admin-console">
  <aside class="admin-rail">
    <a class="console-brand" href="/admin/" aria-label="OMG control center">
      <strong>OMG<span>/</span></strong>
      <small>Control center</small>
    </a>

    <nav aria-label="Admin console">
      {#each navigation as item (item.href)}
        <a href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined}>
          <span>{item.short}</span>
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="console-links">
      <a href="/dashboard/">Account</a>
      <a href="/">Public site</a>
    </div>
  </aside>

  <div class="admin-stage">
    {@render children()}
  </div>
</div>

<style>
  .admin-console {
    min-height: 100vh;
    background: var(--paper);
  }

  .admin-rail {
    display: grid;
    border-bottom: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }

  .console-brand {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--rule);
    color: var(--ink);
    text-decoration: none;
  }

  .console-brand strong {
    font-family: var(--font-display);
    font-size: 1rem;
    letter-spacing: -0.05em;
  }

  .console-brand strong span {
    color: var(--signal);
  }

  .console-brand small,
  .console-links,
  .admin-rail nav a {
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }

  .console-brand small {
    color: var(--ink-muted);
    text-transform: uppercase;
  }

  .admin-rail nav {
    display: flex;
    overflow-x: auto;
  }

  .admin-rail nav a {
    display: flex;
    gap: 0.65rem;
    min-width: max-content;
    padding: 0.9rem 1.25rem;
    border-right: 1px solid var(--rule);
    color: var(--ink-muted);
    text-decoration: none;
  }

  .admin-rail nav a span {
    color: var(--ink-faint);
  }

  .admin-rail nav a:hover,
  .admin-rail nav a[aria-current='page'] {
    background: var(--signal);
    color: var(--signal-ink);
  }

  .admin-rail nav a[aria-current='page'] span {
    color: var(--signal-ink);
  }

  .console-links {
    display: none;
  }

  .admin-stage {
    min-width: 0;
  }

  @media (min-width: 64rem) {
    .admin-console {
      display: grid;
      grid-template-columns: 15rem minmax(0, 1fr);
    }

    .admin-rail {
      position: sticky;
      top: 0;
      grid-template-rows: auto 1fr auto;
      align-self: start;
      height: 100vh;
      border-right: 1px solid var(--rule-strong);
      border-bottom: 0;
    }

    .console-brand {
      display: grid;
      gap: 0.2rem;
      padding: 1.5rem;
    }

    .console-brand strong {
      font-size: 1.35rem;
    }

    .admin-rail nav {
      display: block;
      padding-top: 1rem;
    }

    .admin-rail nav a {
      padding: 0.95rem 1.5rem;
      border-right: 0;
      border-bottom: 1px solid var(--rule);
    }

    .console-links {
      display: grid;
      gap: 0.65rem;
      padding: 1.5rem;
      border-top: 1px solid var(--rule);
    }

    .console-links a {
      color: var(--ink-muted);
      text-underline-offset: 0.2rem;
    }

    .console-links a:hover {
      color: var(--signal);
    }
  }
</style>
