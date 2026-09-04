<script lang="ts">
  import { serializeJsonLd, SITE_ORIGIN } from '../../../shared/public-site';
  import HomeBenchmarks from '../lib/components/home/HomeBenchmarks.svelte';
  import HomeFeatureGrid from '../lib/components/home/HomeFeatureGrid.svelte';
  import HomeHero from '../lib/components/home/HomeHero.svelte';
  import HomeInstallation from '../lib/components/home/HomeInstallation.svelte';

  const canonicalUrl = `${SITE_ORIGIN}/`;
  const socialImage = `${SITE_ORIGIN}/og/omg-og.png`;
  const structuredData = serializeJsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_ORIGIN}/#org`,
        name: 'OMG Package Manager',
        url: canonicalUrl,
        logo: `${SITE_ORIGIN}/icons/icon-512.png`,
        sameAs: ['https://github.com/PyRo1121/omg'],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_ORIGIN}/#website`,
        url: canonicalUrl,
        name: 'OMG Package Manager',
        publisher: { '@id': `${SITE_ORIGIN}/#org` },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'OMG Package Manager',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Linux, macOS, Windows Subsystem for Linux',
        description:
          'A fast package and runtime manager for Linux system packages and reproducible development environments.',
        url: canonicalUrl,
        downloadUrl: `${SITE_ORIGIN}/install.sh`,
        softwareHelp: `${SITE_ORIGIN}/docs/`,
        codeRepository: 'https://github.com/PyRo1121/omg',
        license: 'https://opensource.org/licenses/MIT',
        publisher: { '@id': `${SITE_ORIGIN}/#org` },
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
  <link rel="canonical" href={canonicalUrl} />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="OMG: Stop Managing Package Managers" />
  <meta
    property="og:description"
    content="System packages, language runtimes, and project toolchains through one fast Rust CLI."
  />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={socialImage} />
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
  <meta name="twitter:image" content={socialImage} />
  <meta name="twitter:image:alt" content="OMG package manager workflow" />
  <svelte:element this={"script"} type="application/ld+json">{structuredData}</svelte:element>
</svelte:head>

<main id="main-content" class="home">
  <HomeHero />
  <HomeFeatureGrid />
  <HomeBenchmarks />
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
