import { Link, Meta, Title } from '@solidjs/meta';
import Benchmarks from '../components/Benchmarks';
import Footer from '../components/Footer';
import Header from '../components/Header';
import Hero from '../components/Hero';
import Installation from '../components/Installation';
import { LicenseSuccessModal } from '../components/landing/LicenseSuccessModal';
import FeatureGrid from '../components/landing/FeatureGrid';
import Pricing from '../components/Pricing';
import RuntimeEcosystem from '../components/RuntimeEcosystem';

const FAQ_ITEMS = [
  {
    question: 'What is the OMG package manager?',
    answer:
      'OMG is a Rust-based Linux CLI that manages system packages, language runtimes, and project toolchains through one interface.',
  },
  {
    question: 'Which Linux distributions does OMG support?',
    answer:
      'OMG supports Arch Linux, Debian, and Ubuntu package workflows, with native runtime management and an extended catalog through mise.',
  },
  {
    question: 'Does OMG require sudo?',
    answer:
      'Runtime and user-scoped operations do not require sudo. System package operations follow the permissions required by the underlying Linux package manager.',
  },
] as const;

const structuredData = JSON.stringify([
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'OMG Package Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Linux, macOS, Windows',
    description:
      'A fast package and runtime manager for Linux system packages and reproducible development environments.',
    url: 'https://omg.latham.cloud/',
    downloadUrl: 'https://omg.latham.cloud/#install',
    softwareHelp: 'https://omg.latham.cloud/docs/',
    codeRepository: 'https://github.com/PyRo1121/omg',
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  },
]);

/** Marketing page with static search metadata and post-checkout fulfillment. */
export default function Home() {
  return (
    <>
      <Title>OMG: Fast Linux Package Manager for Packages and Runtimes</Title>
      <Meta
        name="description"
        content="OMG is a fast Rust package manager for Arch, Debian, and Ubuntu. Manage Linux packages, Node.js, Python, Go, Rust, Bun, and reproducible project runtimes with one CLI."
      />
      <Meta
        name="keywords"
        content="Linux package manager, Arch Linux package manager, pacman alternative, apt alternative, runtime manager, Node version manager, Python version manager, Rust CLI"
      />
      <Meta name="robots" content="index, follow, max-image-preview:large" />
      <Link rel="canonical" href="https://omg.latham.cloud/" />

      <Meta property="og:type" content="website" />
      <Meta property="og:title" content="OMG: One Fast Package Manager for Linux" />
      <Meta
        property="og:description"
        content="Manage Linux packages and more than 100 language runtimes through one fast, reproducible CLI."
      />
      <Meta property="og:url" content="https://omg.latham.cloud/" />
      <Meta property="og:image" content="https://omg.latham.cloud/og/omg-og.png" />
      <Meta property="og:image:width" content="1200" />
      <Meta property="og:image:height" content="630" />
      <Meta property="og:image:alt" content="OMG package manager command interface" />
      <Meta property="og:site_name" content="OMG Package Manager" />

      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content="OMG: One Fast Package Manager for Linux" />
      <Meta
        name="twitter:description"
        content="Linux packages and more than 100 language runtimes through one Rust CLI."
      />
      <Meta name="twitter:image" content="https://omg.latham.cloud/og/omg-og.png" />
      <Meta name="twitter:image:alt" content="OMG package manager command interface" />
      <script type="application/ld+json">{structuredData}</script>

      <Header />
      <main id="main-content">
        <Hero />
        <FeatureGrid />
        <RuntimeEcosystem />
        <Benchmarks />
        <Installation />
        <Pricing />

        <section class="manifest-shell py-28 sm:py-36" aria-labelledby="faq-title">
          <h2
            id="faq-title"
            class="max-w-3xl text-5xl leading-[0.94] font-medium tracking-[-0.055em] sm:text-7xl"
          >
            Before you change package managers.
          </h2>
          <dl class="m-0 mt-20 border-t border-[var(--rule-strong)]">
            {FAQ_ITEMS.map(item => (
              <div class="grid gap-4 border-b border-[var(--rule)] py-8 sm:grid-cols-[0.8fr_1.2fr] sm:py-10">
                <dt class="text-xl font-medium tracking-[-0.025em]">{item.question}</dt>
                <dd class="m-0 max-w-2xl leading-relaxed text-[var(--ink-muted)]">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <Footer />
      <LicenseSuccessModal />
    </>
  );
}
