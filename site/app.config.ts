import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    preset: "cloudflare-pages",
    rollupConfig: {
      external: ["node:async_hooks"],
    },
    prerender: {
      routes: ["/", "/login", "/signup"],
      crawlLinks: true,
      ignore: ["/dashboard", "/api/*"],
    },
  },
  vite: {
    server: {
      port: 3000,
    },
    build: {
      target: "esnext",
      minify: "esbuild",
    },
    css: {
      postcss: "./postcss.config.js",
    },
  },
});
