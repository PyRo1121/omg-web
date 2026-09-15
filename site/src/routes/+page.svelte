<script lang="ts">
  import SeoHead from '../lib/components/SeoHead.svelte';
  import { serializeJsonLd, SITE_ORIGIN } from '../../../shared/public-site';
  import HomeBenchmarks from '../lib/components/home/HomeBenchmarks.svelte';
  import HomeFeatureGrid from '../lib/components/home/HomeFeatureGrid.svelte';
  import HomeHero from '../lib/components/home/HomeHero.svelte';
  import HomeInstallation from '../lib/components/home/HomeInstallation.svelte';

  const canonicalUrl = `${SITE_ORIGIN}/`;
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
        isAccessibleForFree: true,
      },
    ],
  });
</script>

<SeoHead
  title="OMG — Package & Runtime Manager for Linux and macOS"
  description="Manage system packages and Node.js, Bun, Python, Go, and Rust versions with one free CLI. Keep project runtimes consistent on Linux, macOS, and WSL."
  path="/"
  {structuredData}
/>

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
