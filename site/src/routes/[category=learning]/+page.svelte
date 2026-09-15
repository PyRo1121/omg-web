<script lang="ts">
  import SeoHead from '../../lib/components/SeoHead.svelte';
  import { learningHref } from '../../lib/learn/catalog';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<SeoHead title={`${data.title} - OMG`} description={data.description} path={`/${data.category}/`} />
<main id="main-content" class="learning-index">
  <p class="page-kicker">OMG / Learn</p>
  <h1>{data.title}</h1>
  <p class="introduction">{data.description}</p>
  <nav aria-label="Learning sections">
    <a href="/runtimes/">Runtimes</a><a href="/guides/">Guides</a><a href="/compare/">Comparisons</a
    ><a href="/docs/">Reference</a>
  </nav>
  <ul>
    {#each data.pages as entry (entry.slug)}
      <li>
        <a href={learningHref(entry)}
          ><h2>{entry.title}</h2>
          <p>{entry.description}</p>
          <span>Read the guide →</span></a
        >
      </li>
    {/each}
  </ul>
</main>

<style>
  .learning-index {
    width: min(calc(100% - 2.5rem), 72rem);
    margin-inline: auto;
    padding-block: clamp(3rem, 7vw, 6rem);
  }
  h1 {
    max-width: 18ch;
    font-size: clamp(2.5rem, 6vw, 5rem);
    line-height: 1.05;
    letter-spacing: -0.05em;
  }
  .introduction {
    max-width: 45rem;
    color: var(--ink-muted);
    font-size: 1.15rem;
    line-height: 1.7;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-block: 2rem 3rem;
  }
  nav a {
    min-height: 2.75rem;
    display: inline-flex;
    align-items: center;
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 1rem;
    padding: 0;
    list-style: none;
  }
  li {
    border: 1px solid var(--rule);
    background: var(--paper-raised);
  }
  li a {
    display: block;
    height: 100%;
    padding: 1.5rem;
    text-decoration: none;
  }
  li a:hover {
    background: var(--paper);
  }
  h2 {
    margin-top: 0;
    color: var(--ink);
    font-size: 1.4rem;
  }
  li p {
    color: var(--ink-muted);
    line-height: 1.7;
  }
  li span {
    color: var(--signal);
  }
</style>
