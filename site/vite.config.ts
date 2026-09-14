import { makeCloudflareAdapter } from '@alchemy.run/frontend-frameworks/sveltekit/cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: makeCloudflareAdapter({ fallback: 'plaintext', notFoundHandling: '404-page' }),
      csp: {
        mode: 'auto',
        directives: {
          'default-src': ['self'],
          'script-src': ['self', 'https://static.cloudflareinsights.com'],
          'style-src': ['self', 'unsafe-inline'],
          'img-src': ['self', 'data:', 'https://avatars.githubusercontent.com'],
          'font-src': ['self', 'data:'],
          'connect-src': ['self', 'https://cloudflareinsights.com'],
          'frame-ancestors': ['none'],
          'base-uri': ['self'],
          'form-action': ['self'],
          'object-src': ['none'],
          'worker-src': ['self'],
        },
      },
    }),
  ],
});
