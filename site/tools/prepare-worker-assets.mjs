import { mkdir, rm, writeFile } from 'node:fs/promises';

const distRoot = new URL('../dist/', import.meta.url);

// Wrangler includes the built main module in generated types only when dist
// exists. Type drift checks therefore start from the same clean state as CI.
if (process.argv.includes('--clean')) {
  await rm(distRoot, { recursive: true, force: true });
}
await mkdir(distRoot, { recursive: true });

// Workers Static Assets must not serve the server bundle as a static file.
await writeFile(new URL('.assetsignore', distRoot), '_worker.js\n');
process.stdout.write('[prepare-worker-assets] wrote dist/.assetsignore\n');
