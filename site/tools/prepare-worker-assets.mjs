import { writeFile } from 'node:fs/promises';

const distRoot = new URL('../dist/', import.meta.url);

// Workers Static Assets must not serve the server bundle as a static file.
await writeFile(new URL('.assetsignore', distRoot), '_worker.js\n');
process.stdout.write('[prepare-worker-assets] wrote dist/.assetsignore\n');
