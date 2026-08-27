import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SITE_ORIGIN } from '../site/shared/security-headers.ts';

export default defineConfig({
  plugins: [
    sveltekit({
      csp: {
        mode: 'auto',
        directives: {
          'default-src': ['self'],
          'script-src': ['self', 'https://static.cloudflareinsights.com'],
          'style-src': ['self', 'unsafe-inline'],
          'img-src': ['self', 'data:', 'https://avatars.githubusercontent.com'],
          'font-src': ['self', 'data:'],
          'connect-src': [
            'self',
            SITE_ORIGIN,
            'https://omg-api.latham.cloud',
            'https://api.github.com',
            'https://cloudflareinsights.com',
          ],
          'frame-ancestors': ['none'],
          'base-uri': ['self'],
          'form-action': ['self', SITE_ORIGIN, 'https://github.com'],
          'object-src': ['none'],
          'worker-src': ['self'],
        },
      },
    }),
  ],
});
