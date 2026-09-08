<script lang="ts">
  type AccountWorkspaceRoute =
    'overview' | 'analytics' | 'achievements' | 'machines' | 'organization' | 'settings';

  let {
    active,
    showOrganization = false,
  }: {
    active: AccountWorkspaceRoute;
    showOrganization?: boolean;
  } = $props();

  const links: ReadonlyArray<{
    readonly id: AccountWorkspaceRoute;
    readonly href: string;
    readonly label: string;
  }> = [
    { id: 'overview', href: '/dashboard/', label: 'Overview' },
    { id: 'analytics', href: '/dashboard/analytics/', label: 'Analytics' },
    { id: 'achievements', href: '/dashboard/achievements/', label: 'Achievements' },
    { id: 'machines', href: '/dashboard/machines/', label: 'Machines' },
    { id: 'settings', href: '/dashboard/settings/', label: 'Settings' },
  ];

  const organizationLink = {
    id: 'organization',
    href: '/dashboard/organization/',
    label: 'Organization',
  } satisfies {
    readonly id: AccountWorkspaceRoute;
    readonly href: string;
    readonly label: string;
  };
</script>

<nav class="workspace-nav" aria-label="Account workspace">
  {#each links as link (link.id)}
    <a href={link.href} aria-current={active === link.id ? 'page' : undefined}>{link.label}</a>
  {/each}
  {#if showOrganization}
    <a
      href={organizationLink.href}
      aria-current={active === organizationLink.id ? 'page' : undefined}>{organizationLink.label}</a
    >
  {/if}
</nav>

<style>
  .workspace-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    margin: 2rem 0 2.5rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .workspace-nav a {
    color: var(--ink-muted);
    text-decoration: none;
  }

  .workspace-nav a:hover,
  .workspace-nav a[aria-current='page'] {
    color: var(--signal);
  }
</style>
