<script lang="ts">
  import { serializeJsonLd } from '../../../shared/public-site';
  import type { PageProps } from './$types';
  import CheckoutStatus from '../lib/components/home/CheckoutStatus.svelte';
  import HomeBenchmarks from '../lib/components/home/HomeBenchmarks.svelte';
  import HomeFeatureGrid from '../lib/components/home/HomeFeatureGrid.svelte';
  import HomeHero from '../lib/components/home/HomeHero.svelte';
  import HomeInstallation from '../lib/components/home/HomeInstallation.svelte';
  import HomePricing from '../lib/components/home/HomePricing.svelte';

  let { data, form }: PageProps = $props();
  const claimedOffer = $derived(form?.kind === 'offer' ? form.offer : null);
  const offerError = $derived(form?.kind === 'offer-error' ? form.message : null);
  const checkoutError = $derived(form?.kind === 'checkout-error' ? form.message : null);
  const promotionCode = $derived(
    form?.kind === 'offer'
      ? form.offer.code
      : form?.kind === 'checkout-error'
        ? form.promotionCode
        : null
  );

  const structuredData = serializeJsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://omg.latham.cloud/#org',
        name: 'OMG Package Manager',
        url: 'https://omg.latham.cloud/',
        logo: 'https://omg.latham.cloud/icons/icon-512.png',
        sameAs: ['https://github.com/PyRo1121/omg'],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://omg.latham.cloud/#website',
        url: 'https://omg.latham.cloud/',
        name: 'OMG Package Manager',
        publisher: { '@id': 'https://omg.latham.cloud/#org' },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'OMG Package Manager',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Linux, macOS, Windows Subsystem for Linux',
        description:
          'A fast package and runtime manager for Linux system packages and reproducible development environments.',
        url: 'https://omg.latham.cloud/',
        downloadUrl: 'https://omg.latham.cloud/install.sh',
        softwareHelp: 'https://omg.latham.cloud/docs/',
        codeRepository: 'https://github.com/PyRo1121/omg',
        license: 'https://www.gnu.org/licenses/agpl-3.0.html',
        publisher: { '@id': 'https://omg.latham.cloud/#org' },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  });
</script>

<svelte:head>
  <title>OMG: One CLI for Packages, Runtimes, and Project Toolchains</title>
  <meta
    name="description"
    content="OMG is a free, open-source CLI that installs apps and manages Node.js, Python, Go, and Rust versions on Linux and macOS with one command instead of apt, brew, nvm, pyenv, and rustup."
  />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="https://omg.latham.cloud/" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="OMG: Stop Managing Package Managers" />
  <meta
    property="og:description"
    content="System packages, language runtimes, and project toolchains through one fast Rust CLI."
  />
  <meta property="og:url" content="https://omg.latham.cloud/" />
  <meta property="og:image" content="https://omg.latham.cloud/og/omg-og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta
    property="og:image:alt"
    content="The OMG landing page headline beside a large orange 7→1 graphic representing seven package tools replaced by one command."
  />
  <meta property="og:site_name" content="OMG Package Manager" />
  <meta property="og:locale" content="en_US" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="OMG: Stop Managing Package Managers" />
  <meta
    name="twitter:description"
    content="Packages, runtimes, and project toolchains through one Rust CLI."
  />
  <meta name="twitter:image" content="https://omg.latham.cloud/og/omg-og.png" />
  <meta name="twitter:image:alt" content="OMG package manager workflow" />
  <svelte:element this={"script"} type="application/ld+json">{structuredData}</svelte:element>
</svelte:head>

<main id="main-content" class="home">
  {#if data.fulfillment !== null}
    <CheckoutStatus fulfillment={data.fulfillment} />
  {/if}
  <HomeHero />
  <HomeFeatureGrid />
  <HomeBenchmarks />
  <HomePricing offer={claimedOffer} {offerError} {checkoutError} {promotionCode} />
  <HomeInstallation />
</main>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }

  .home {
    --content-width: 88rem;
    overflow: hidden;
    background:
      linear-gradient(var(--rule), var(--rule)) top / 100% 1px no-repeat,
      var(--paper);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(html) {
      scroll-behavior: auto;
    }
  }
</style>
