<script lang="ts">
  import { SITE_ORIGIN } from '../../../../shared/public-site';
  import { RELEASE_NOTES, releaseDate } from '../../lib/release-notes';
  const canonicalUrl = `${SITE_ORIGIN}/updates/`;
</script>

<svelte:head>
  <title>Release notes and updates - OMG</title>
  <meta
    name="description"
    content="Reviewed highlights from published OMG releases. See what changed, when it shipped, and where to read the complete notes."
  />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:title" content="Release notes and updates - OMG" />
  <meta
    property="og:description"
    content="Published releases, real dates, and selected changes to the free OMG developer tools."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl} />
</svelte:head>

<main id="main-content" class="updates-shell">
  <header>
    <p class="page-kicker">OMG / release notes</p>
    <h1>What changed.</h1>
    <p class="introduction">
      Selected highlights from published releases. Free and open source, with the details here when
      you need them.
    </p>
    <nav aria-label="Release resources">
      <a href="/docs/">Documentation</a><a href="/docs/installation/">Installation guide</a>
    </nav>
  </header>
  <aside aria-label="Release compatibility">
    OMG is alpha software. Commands, flags, and on-disk formats can change. These summaries are
    reviewed selections, not the complete release notes. Check the full notes before updating
    important environments.
  </aside>
  <section aria-label="Published releases">
    {#each RELEASE_NOTES as release, index (release.version)}
      <details open={index === 0}>
        <summary>
          <span class="version">{release.version}</span>
          <span>{release.title}</span>
          <time datetime={release.date}>{releaseDate(release.date)}</time>
        </summary>
        <div class="release-body">
          <ul>
            {#each release.changes as change (change)}<li>{change}</li>{/each}
          </ul>
          <a href={`https://github.com/PyRo1121/omg/releases/tag/${release.version}`}
            >Full {release.version} release notes <span aria-hidden="true">↗</span></a
          >
        </div>
      </details>
    {/each}
  </section>
</main>

<style>
  .updates-shell {
    width: min(calc(100% - 2rem), 70rem);
    margin-inline: auto;
    padding-block: clamp(3rem, 7vw, 6rem);
  }
  h1 {
    margin: 1rem 0;
    font-family: var(--font-display);
    font-size: clamp(3rem, 7vw, 6rem);
    line-height: 1;
    letter-spacing: -0.06em;
    font-weight: 550;
  }
  .introduction {
    max-width: 50ch;
    color: var(--ink-muted);
    line-height: 1.7;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 2rem;
    margin-block: 1.5rem 3rem;
  }
  a {
    color: var(--ink);
    text-decoration-color: var(--signal);
    text-underline-offset: 0.3em;
  }
  aside {
    max-width: 65ch;
    color: var(--ink-muted);
    line-height: 1.7;
    margin-bottom: 3rem;
  }
  details {
    border-top: 1px solid var(--rule);
  }
  details:last-child {
    border-bottom: 1px solid var(--rule);
  }
  summary {
    padding-block: 1.5rem;
    cursor: pointer;
    line-height: 1.8;
  }
  summary::marker {
    color: var(--signal);
  }
  summary:focus-visible {
    outline: 2px solid var(--signal);
    outline-offset: 4px;
  }
  .version {
    color: var(--signal);
    font-family: var(--font-mono);
    margin-right: 1rem;
  }
  time {
    display: block;
    color: var(--ink-muted);
    font-size: 0.8rem;
  }
  .release-body {
    padding: 0 0 2rem 1.25rem;
    max-width: 65ch;
  }
  ul {
    padding-left: 1.1rem;
    margin: 0 0 1.5rem;
  }
  li {
    margin-bottom: 0.75rem;
    line-height: 1.7;
  }
  @media (min-width: 48rem) {
    time {
      float: right;
      line-height: 2.25;
    }
  }
</style>
