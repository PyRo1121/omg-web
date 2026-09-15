<script lang="ts">
  import { SITE_ORIGIN } from '../../../../shared/public-site';

  let {
    title,
    description,
    path,
    type = 'website',
    structuredData,
  }: {
    title: string;
    description: string;
    path: string;
    type?: 'website' | 'article';
    /** Already serialized with serializeJsonLd, never raw user content. */
    structuredData?: string;
  } = $props();

  const canonical = $derived(`${SITE_ORIGIN}${path}`);
  const image = `${SITE_ORIGIN}/og/omg-discovery-2026.png`;
  const imageAlt =
    'OMG: one CLI for system packages, language runtimes, and development environments.';
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content={type} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:site_name" content="OMG Package Manager" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="1731" />
  <meta property="og:image:height" content="909" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content={imageAlt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />
  <meta name="twitter:image:alt" content={imageAlt} />
  {#if structuredData}
    <svelte:element this={"script"} type="application/ld+json">{structuredData}</svelte:element>
  {/if}
</svelte:head>
