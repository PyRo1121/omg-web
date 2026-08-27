import { defineConfig } from '@solidjs/start/config';

export default defineConfig({
  middleware: 'src/middleware.ts',
  serialization: {
    // JSON avoids SolidStart's JavaScript deserializer, which requires eval()
    // and is intentionally blocked by the production Content Security Policy.
    mode: 'json',
  },
  server: {
    preset: 'cloudflare-pages',
    rollupConfig: {
      external: ['node:async_hooks'],
    },
    prerender: {
      routes: ['/', '/login', '/signup'],
      crawlLinks: true,
      ignore: ['/dashboard', '/api/*'],
    },
  },
  vite: {
    server: {
      port: 3000,
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
    },
    css: {
      postcss: './postcss.config.js',
    },
  },
});
