<script lang="ts">
  import { serializeJsonLd, SITE_ORIGIN } from '../../../../../shared/public-site';
  import {
    LEARNING_CATEGORIES,
    LEARNING_PAGES,
    learningHref,
    type LearningPageMeta,
  } from '../../learn/catalog';
  import type { LearningContent } from '../../learn/page';
  import DocsBlocks from '../docs/DocsBlocks.svelte';
  import SeoHead from '../SeoHead.svelte';

  let { meta, content }: { meta: LearningPageMeta; content: LearningContent } = $props();
  const path = $derived(learningHref(meta));
  const section = $derived(LEARNING_CATEGORIES[meta.category]);
  const related = $derived(
    content.related.map(href => ({
      href,
      title:
        LEARNING_PAGES.find(page => learningHref(page) === href)?.title ??
        (href.startsWith('/docs/') ? 'OMG ' + href.split('/')[2] + ' reference' : href),
    }))
  );
  const structuredData = $derived(
    serializeJsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
            {
              '@type': 'ListItem',
              position: 2,
              name: section.title,
              item: `${SITE_ORIGIN}/${meta.category}/`,
            },
            { '@type': 'ListItem', position: 3, name: meta.title, item: `${SITE_ORIGIN}${path}` },
          ],
        },
        {
          '@type': 'TechArticle',
          headline: meta.title,
          description: meta.description,
          url: `${SITE_ORIGIN}${path}`,
          dateModified: meta.modified,
          author: {
            '@type': 'Organization',
            name: 'OMG maintainers',
            url: 'https://github.com/PyRo1121/omg',
          },
          mainEntityOfPage: `${SITE_ORIGIN}${path}`,
        },
      ],
    })
  );
</script>

<SeoHead
  title={`${meta.title} - OMG`}
  description={meta.description}
  {path}
  type="article"
  {structuredData}
/>
<main id="main-content" class="learning-article">
  <nav aria-label="Breadcrumb">
    <a href="/">Home</a><span aria-hidden="true"> / </span><a href={`/${meta.category}/`}
      >{section.title}</a
    >
  </nav>
  <header>
    <h1>{meta.title}</h1>
    <p class="summary">{meta.description}</p>
    <p class="byline">
      OMG maintainers · Updated <time datetime={meta.modified}>{meta.modified}</time> · Source-reviewed
      guide
    </p>
  </header>
  <div class="article-layout">
    <aside>
      <nav aria-label="On this page">
        <p>On this page</p>
        <ul>
          {#each content.sections as entry (entry.id)}<li>
              <a href={`#${entry.id}`}>{entry.heading}</a>
            </li>{/each}
        </ul>
        <a href="/docs/installation/">Install OMG</a>
      </nav>
    </aside>
    <article>
      {#each content.sections as entry (entry.id)}
        <section id={entry.id}>
          <h2>{entry.heading}</h2>
          {#each entry.blocks as block}<DocsBlocks {block} />{/each}
        </section>
      {/each}
      <section id="sources">
        <h2>Sources and verification</h2>
        <p>
          Commands and behavior are based on the references below. Source review is not a claim that
          every workflow has been executed on every supported platform.
        </p>
        <ul>
          {#each content.sources as source (source.href)}<li>
              <a href={source.href}>{source.title}</a>
            </li>{/each}
        </ul>
        <a href={`/markdown/${meta.category}/${meta.slug}/`}>Read as Markdown</a>
      </section>
      <nav class="related" aria-label="Related guides">
        <h2>Continue learning</h2>
        <ul>
          {#each related as entry (entry.href)}<li>
              <a href={entry.href}>{entry.title}</a>
            </li>{/each}
        </ul>
      </nav>
    </article>
  </div>
</main>

<style>
  .learning-article {
    width: min(calc(100% - 2.5rem), 80rem);
    margin-inline: auto;
    padding-block: clamp(2rem, 6vw, 5rem);
  }
  header {
    padding-block: 1rem 2rem;
    border-bottom: 1px solid var(--rule);
  }
  h1 {
    max-width: 22ch;
    font-size: clamp(2.25rem, 5vw, 4.5rem);
    line-height: 1.08;
    letter-spacing: -0.05em;
    overflow-wrap: anywhere;
  }
  .summary {
    max-width: 48rem;
    color: var(--ink-muted);
    font-size: 1.2rem;
    line-height: 1.7;
  }
  .byline {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.8;
  }
  .article-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
    padding-block: 2rem;
  }
  aside {
    font-size: 0.9rem;
  }
  aside nav {
    position: sticky;
    top: 1.5rem;
  }
  aside ul {
    padding-left: 1rem;
  }
  aside a {
    display: inline-block;
    padding-block: 0.4rem;
  }
  article {
    min-width: 0;
    line-height: 1.8;
  }
  section {
    margin-bottom: 3rem;
    scroll-margin-top: 2rem;
  }
  h2 {
    line-height: 1.25;
    font-size: clamp(1.6rem, 3vw, 2.2rem);
    letter-spacing: -0.03em;
  }
  #sources {
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
  }
  #sources p {
    color: var(--ink-muted);
  }
  li {
    margin-block: 0.5rem;
  }
  .related {
    padding: 1.5rem;
    background: var(--paper-raised);
    border: 1px solid var(--rule);
  }
  .related h2 {
    margin-top: 0;
  }
  @media (min-width: 64rem) {
    .article-layout {
      grid-template-columns: 15rem minmax(0, 1fr);
      gap: 3rem;
    }
  }
</style>
