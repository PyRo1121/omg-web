<script lang="ts">
  import AccountWorkspaceNav from '../../../lib/components/AccountWorkspaceNav.svelte';
  import type { PageProps } from './$types';
  import { formatTimestamp } from '../dashboard-view';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Account achievements - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel achievements-panel" aria-labelledby="achievements-title">
    <AccountWorkspaceNav active="achievements" />

    <p class="page-kicker">Account / Achievements</p>
    <h1 id="achievements-title" class="account-title">Achievements.</h1>

    {#if data.achievements.status === 'verification-required'}
      <p class="achievement-state">Verify your email to access achievements.</p>
    {:else if data.achievements.status === 'unavailable'}
      <p class="achievement-state" role="status">Achievements are temporarily unavailable.</p>
    {:else if data.achievements.achievements.total === 0}
      <p class="achievement-state">No achievements are available yet.</p>
    {:else}
      <p class="achievement-count">
        {data.achievements.achievements.unlocked} of {data.achievements.achievements.total} unlocked
      </p>
      <ul class="achievement-list">
        {#each data.achievements.achievements.achievements as achievement (achievement)}
          <li class={achievement.unlocked ? 'unlocked' : ''}>
            <header>
              <h2>{achievement.name}</h2>
              <span>{achievement.unlocked ? 'Unlocked' : 'Locked'}</span>
            </header>
            <p>{achievement.description}</p>
            {#if achievement.unlockedAt !== null}
              <small>Unlocked {formatTimestamp(achievement.unlockedAt)}</small>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  .achievements-panel {
    max-width: 58rem;
  }
  .achievement-state,
  .achievement-count {
    margin-top: 2rem;
    color: var(--ink-muted);
  }
  .achievement-count {
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
  .achievement-list {
    display: grid;
    gap: 1px;
    margin: 2rem 0 0;
    padding: 1px;
    background: var(--rule);
    list-style: none;
  }
  .achievement-list li {
    padding: 1.5rem;
    background: var(--paper);
  }
  .achievement-list li.unlocked {
    box-shadow: inset 3px 0 0 var(--signal);
  }
  .achievement-list header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: baseline;
    justify-content: space-between;
  }
  .achievement-list h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    letter-spacing: -0.03em;
  }
  .achievement-list header span,
  .achievement-list small {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    text-transform: uppercase;
  }
  .achievement-list p {
    margin: 0.75rem 0 0;
    color: var(--ink-muted);
    line-height: 1.6;
  }
  .achievement-list small {
    display: block;
    margin-top: 1rem;
    text-transform: none;
  }
  @media (min-width: 48rem) {
    .achievement-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
