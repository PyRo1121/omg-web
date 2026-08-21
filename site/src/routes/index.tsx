import { createSignal, onMount, Show } from 'solid-js';
import { Title, Meta, Link } from '@solidjs/meta';
import { clientOnly } from '@solidjs/start';
import Header from '../components/Header';
import Hero from '../components/Hero';
import FeatureGrid from '../components/landing/FeatureGrid';
import RuntimeEcosystem from '../components/RuntimeEcosystem';
import Benchmarks from '../components/Benchmarks';
import Pricing from '../components/Pricing';
import Installation from '../components/Installation';
import Footer from '../components/Footer';
import { LicenseSuccessModal } from '../components/landing/LicenseSuccessModal';

const BackgroundMesh = clientOnly(() => import('../components/3d/BackgroundMesh'));

/**
 * Landing page. Composes the marketing sections and defers post-checkout
 * license retrieval to {@link LicenseSuccessModal}.
 */
export default function Home() {
  const [show3D, setShow3D] = createSignal(false);

  onMount(() => {
    window.requestIdleCallback(() => setShow3D(true), { timeout: 8000 });
  });

  return (
    <>
      <Title>OMG - Fastest Linux Package Manager | 22x Faster Than Pacman</Title>
      <Meta
        name="description"
        content="Stop switching between 7 package managers. OMG is 22x faster than pacman with native Node.js, Python, Go, Rust, Ruby, Java, and Bun support. Pure Rust CLI for Arch Linux, Debian, and Ubuntu."
      />
      <Meta
        name="keywords"
        content="package manager, linux package manager, arch linux, pacman alternative, yay alternative, nvm alternative, pyenv alternative, rustup alternative, unified package manager"
      />
      <Link rel="canonical" href="https://omg.latham.cloud/" />

      <Meta property="og:type" content="website" />
      <Meta property="og:title" content="OMG - Fastest Linux Package Manager | 22x Faster" />
      <Meta
        property="og:description"
        content="Unified CLI for system packages + language runtimes. Native Node, Python, Go, Rust, Ruby, Java, Bun managers. 22x faster than pacman. Pure Rust."
      />
      <Meta property="og:url" content="https://omg.latham.cloud/" />
      <Meta property="og:image" content="https://omg.latham.cloud/og/omg-og.png" />
      <Meta property="og:site_name" content="OMG Package Manager" />

      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content="OMG - Fastest Linux Package Manager" />
      <Meta
        name="twitter:description"
        content="One CLI for packages + runtimes. Node, Python, Go, Rust, Ruby, Java, Bun. 22x faster than pacman. Pure Rust."
      />
      <Meta name="twitter:image" content="https://omg.latham.cloud/og/omg-og.png" />

      <div class="min-h-screen">
        <Show when={show3D()}>
          <BackgroundMesh fallback={null} />
        </Show>
        <Header />
        <main>
          <Hero />
          <div class="relative z-10">
            <FeatureGrid />
            <RuntimeEcosystem />
            <Benchmarks />
            <Installation />
            <Pricing />
          </div>
        </main>
        <Footer />

        <LicenseSuccessModal />
      </div>
    </>
  );
}
