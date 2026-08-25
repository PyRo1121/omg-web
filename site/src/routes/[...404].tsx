import { HttpStatusCode } from '@solidjs/start';
import { A } from '@solidjs/router';
import { Title, Meta, Link } from '@solidjs/meta';
import Footer from '~/components/Footer';
import Header from '~/components/Header';

/** Catch-all for unmatched routes: renders a real 404 status with recovery paths. */
export default function NotFoundPage() {
  return (
    <>
      <Title>Page not found - OMG Package Manager</Title>
      <Meta
        name="description"
        content="This page does not exist. Install OMG, read the documentation, or go back to the homepage."
      />
      <Meta name="robots" content="noindex, follow" />
      <Link rel="canonical" href="https://omg.latham.cloud/404" />
      <HttpStatusCode code={404} />

      <div class="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
        <Header />
        <main id="main-content" class="manifest-shell px-5 pt-32 pb-24 sm:px-8 sm:pt-40">
          <p class="font-mono text-xs text-[var(--signal)]">404</p>
          <h1 class="mt-6 max-w-[12ch] text-6xl leading-[0.9] font-semibold tracking-[-0.06em] sm:text-8xl">
            This page does not exist.
          </h1>
          <p class="mt-6 max-w-lg text-lg leading-relaxed text-[var(--ink-muted)]">
            The address may be mistyped or the page moved. Start from the homepage, or jump straight
            to the install command.
          </p>
          <div class="mt-10 flex flex-wrap gap-4">
            <A href="/" class="manifest-button manifest-button--primary">
              Back to homepage
            </A>
            <A href="/docs/" class="manifest-button">
              Read the docs
            </A>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
