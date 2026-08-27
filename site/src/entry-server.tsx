import { createHandler, StartServer } from '@solidjs/start/server';
import { contentSecurityPolicyWithNonce, createCspNonce } from '../shared/security-headers';
// Preloaded by URL so the LCP font starts downloading before CSS @font-face discovery.
import archivoLatinWoff2 from '@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2?url';
import plexMonoLatin400Woff2 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';

export default createHandler(
  () => (
    <StartServer
      document={({ assets, children, scripts }) => (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
            <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
            <link rel="manifest" href="/site.webmanifest" />
            <meta name="theme-color" content="#0a0a0a" />

            {/* Preconnects */}
            <link rel="preconnect" href="https://omg-api.latham.cloud" />

            {/* LCP-critical fonts (web.dev font best practices: preload above-the-face fonts) */}
            <link
              rel="preload"
              href={archivoLatinWoff2}
              as="font"
              type="font/woff2"
              crossorigin="anonymous"
            />
            <link
              rel="preload"
              href={plexMonoLatin400Woff2}
              as="font"
              type="font/woff2"
              crossorigin="anonymous"
            />

            {assets}
          </head>
          <body class="bg-[#0a0a0a] text-white antialiased">
            <div id="app">{children}</div>
            {scripts}
          </body>
        </html>
      )}
    />
  ),
  context => {
    const nonce = createCspNonce();
    context.response.headers.set('Content-Security-Policy', contentSecurityPolicyWithNonce(nonce));
    return { nonce };
  }
);
