import { Link, Meta, Title } from '@solidjs/meta';
import { serializeJsonLd } from '../../shared/public-site';
import Benchmarks from '../components/Benchmarks';
import Footer from '../components/Footer';
import Header from '../components/Header';
import Hero from '../components/Hero';
import Installation from '../components/Installation';
import { LicenseSuccessModal } from '../components/landing/LicenseSuccessModal';
import FeatureGrid from '../components/landing/FeatureGrid';
import Pricing from '../components/Pricing';

const structuredData = serializeJsonLd({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://omg.latham.cloud/#org',
      name: 'OMG Package Manager',
      url: 'https://omg.latham.cloud/',
      logo: 'https://omg.latham.cloud/apple-touch-icon.png',
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
      downloadUrl: 'https://omg.latham.cloud/#install',
      softwareHelp: 'https://omg.latham.cloud/docs/',
      codeRepository: 'https://github.com/PyRo1121/omg',
      license: 'https://www.gnu.org/licenses/agpl-3.0.html',
      publisher: { '@id': 'https://omg.latham.cloud/#org' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ],
});

/** Marketing page with static search metadata and post-checkout fulfillment. */
export default function Home() {
  return (
    <>
      <Title>OMG: One CLI for Packages, Runtimes, and Project Toolchains</Title>
      <Meta
        name="description"
        content="OMG is a free, open-source CLI that installs apps and manages Node.js, Python, Go, and Rust versions on Linux and macOS — one command instead of apt, brew, nvm, pyenv, and rustup."
      />
      <Meta name="robots" content="index, follow, max-image-preview:large" />
      <Link rel="canonical" href="https://omg.latham.cloud/" />

      <Meta property="og:type" content="website" />
      <Meta property="og:title" content="OMG: Stop Managing Package Managers" />
      <Meta
        property="og:description"
        content="System packages, language runtimes, and project toolchains through one fast Rust CLI."
      />
      <Meta property="og:url" content="https://omg.latham.cloud/" />
      <Meta property="og:image" content="https://omg.latham.cloud/og/omg-og.png" />
      <Meta property="og:image:width" content="1200" />
      <Meta property="og:image:height" content="630" />
      <Meta property="og:image:type" content="image/png" />
      <Meta
        property="og:image:alt"
        content="The OMG landing page headline beside a large orange 7→1 graphic representing seven package tools replaced by one command."
      />
      <Meta property="og:site_name" content="OMG Package Manager" />

      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content="OMG: Stop Managing Package Managers" />
      <Meta
        name="twitter:description"
        content="Packages, runtimes, and project toolchains through one Rust CLI."
      />
      <Meta name="twitter:image" content="https://omg.latham.cloud/og/omg-og.png" />
      <Meta name="twitter:image:alt" content="OMG package manager workflow" />
      <script type="application/ld+json">{structuredData}</script>

      <Header />
      <main id="main-content">
        <Hero />
        <FeatureGrid />
        <Benchmarks />
        <Pricing />
        <Installation />
      </main>
      <Footer />
      <LicenseSuccessModal />
    </>
  );
}
