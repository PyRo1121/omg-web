<script lang="ts">
  import { serializeJsonLd } from '../../../../../shared/public-site';
  import { SITE_ORIGIN } from '../../../../../shared/public-site';
  import type { DocsTopic } from '../../docs/topic';
  import { DOCS_TOPICS, docsTopicHref, docsSourceHref } from '../../docs/topics';
  import DocsBlocks from './DocsBlocks.svelte';

  let { topic }: { topic: DocsTopic } = $props();

  const socialImage = `${SITE_ORIGIN}/og/omg-og.png`;
  const socialImageAlt =
    'The OMG landing page headline beside a large orange 7→1 graphic representing seven package tools replaced by one command.';

  const canonical = $derived(`${SITE_ORIGIN}/docs/${topic.slug}/`);
  const pageTitle = $derived(`${topic.title} - OMG Package Manager`);
  const sourceHref = $derived(docsSourceHref(topic.source));
  const shortCommit = $derived(topic.source.reviewedCommit.slice(0, 7));

  const breadcrumbData = $derived(
    serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Docs', item: `${SITE_ORIGIN}/docs/` },
        { '@type': 'ListItem', position: 3, name: topic.navLabel, item: canonical },
      ],
    })
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={topic.summary} />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href={canonical} />

  <meta property="og:type" content="article" />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={topic.summary} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={socialImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content={socialImageAlt} />
  <meta property="og:site_name" content="OMG Package Manager" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={topic.summary} />
  <meta name="twitter:image" content={socialImage} />
  <meta name="twitter:image:alt" content={socialImageAlt} />
  <svelte:element this={"script"} type="application/ld+json">{breadcrumbData}</svelte:element>
</svelte:head>

<main id="main-content" class="docs-topic">
  <div class="topic-layout">
    <aside class="topic-aside">
      <nav class="topic-nav" aria-label="Documentation topics">
        <p>Documentation</p>
        <ul>
          {#each DOCS_TOPICS as entry (entry.slug)}
            <li>
              <a
                href={docsTopicHref(entry.slug)}
                aria-current={entry.slug === topic.slug ? 'page' : undefined}
              >
                {entry.navLabel}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>

    <article>
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="/">Home</a></li>
          <li><a href="/docs/">Docs</a></li>
          <li><span aria-current="page">{topic.navLabel}</span></li>
        </ol>
      </nav>

      <header class="topic-header">
        <h1>{topic.title}</h1>
        <p class="topic-summary">{topic.summary}</p>
      </header>

      {#each topic.sections as section (section.id)}
        <section id={section.id} class="topic-section">
          <h2>{section.heading}</h2>
          {#each section.blocks as block}
            <DocsBlocks {block} />
          {/each}
        </section>
      {/each}

      <footer class="topic-provenance">
        <p>
          Reviewed against
          <a href={sourceHref} target="_blank" rel="noopener noreferrer">
            {topic.source.repo}/{topic.source.path}
          </a>
          at commit {shortCommit} on {topic.source.reviewedAt}. This page was checked against the
          CLI code and documentation at that commit.
        </p>
      </footer>
    </article>
  </div>
</main>

<style>
  .docs-topic {
    width: min(100%, 90rem);
    margin-inline: auto;
    border-inline: 1px solid var(--rule);
  }

  .topic-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
  }

  .topic-aside {
    padding: 1.25rem;
    border-bottom: 1px solid var(--rule);
  }

  .topic-nav p {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.625rem;
    text-transform: uppercase;
  }

  .topic-nav ul {
    display: flex;
    gap: 1.25rem;
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
    overflow-x: auto;
  }

  .topic-nav li {
    flex: 0 0 auto;
  }

  .topic-nav a {
    display: block;
    padding-block: 0.25rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    text-decoration: none;
    white-space: nowrap;
  }

  .topic-nav a:hover {
    color: var(--signal);
  }

  .topic-nav a[aria-current='page'] {
    color: var(--ink);
    font-weight: 600;
  }

  article {
    min-width: 0;
    padding-inline: clamp(1rem, 4vw, 3rem);
  }

  .breadcrumbs {
    padding-top: 1.5rem;
  }

  .breadcrumbs ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.6875rem;
  }

  .breadcrumbs li + li::before {
    content: '/';
    margin-right: 0.375rem;
    color: var(--signal);
  }

  .breadcrumbs a {
    color: var(--ink-muted);
    text-decoration: none;
  }

  .breadcrumbs a:hover {
    color: var(--signal);
  }

  .breadcrumbs [aria-current='page'] {
    color: var(--ink);
  }

  .topic-header {
    padding-top: 2.5rem;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(2.25rem, 7vw, 4.25rem);
    font-weight: 650;
    letter-spacing: -0.055em;
    line-height: 0.95;
    text-wrap: balance;
  }

  .topic-summary {
    max-width: 40rem;
    margin: 1.25rem 0 0;
    color: var(--ink-muted);
    font-size: 1.0625rem;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .topic-section {
    margin-top: 3rem;
    padding-top: 3rem;
    border-top: 1px solid var(--rule);
    scroll-margin-top: 2rem;
  }

  .topic-section h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    font-weight: 650;
    letter-spacing: -0.045em;
    line-height: 1.05;
    text-wrap: balance;
  }

  .topic-provenance {
    margin-top: 3rem;
    padding: 1.5rem 0 3rem;
    border-top: 1px solid var(--rule);
  }

  .topic-provenance p {
    max-width: 46rem;
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .topic-provenance a {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .topic-provenance a:hover {
    color: var(--signal);
  }

  @media (min-width: 64rem) {
    .topic-layout {
      grid-template-columns: 16rem minmax(0, 1fr);
    }

    .topic-aside {
      padding: 2rem;
      border-right: 1px solid var(--rule);
      border-bottom: 0;
    }

    .topic-nav ul {
      display: grid;
      gap: 0.0625rem;
    }

    .topic-nav li {
      flex: none;
    }

    .topic-nav a {
      font-size: 0.6875rem;
    }

    .topic-nav {
      position: sticky;
      top: 2rem;
    }
  }
</style>
