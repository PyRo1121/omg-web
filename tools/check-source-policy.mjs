import { readFile, readdir } from 'node:fs/promises';

const workspaceRoot = new URL('../', import.meta.url);
const sourceRoots = [
  'site/src',
  'site/shared',
  'site/e2e',
  'site-svelte/src',
  'site/workers/src',
  'site/workers/tests',
  'workers/router/src',
  'workers/releases/src',
];
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.svelte', '.ts', '.tsx']);
const forbiddenPolicies = [
  { marker: '@effect/schema', reason: 'use Schema from the main effect package' },
  { marker: 'Effect.promise(', reason: 'use a typed Effect.tryPromise boundary' },
  { marker: 'console.', reason: 'use the typed observability boundary' },
  { marker: 'oxlint-disable', reason: 'fix the anti-slop violation instead of suppressing it' },
  { marker: 'eslint-disable', reason: 'fix the lint violation instead of suppressing it' },
  { marker: '@ts-ignore', reason: 'model and fix the type error' },
  { marker: '@ts-expect-error', reason: 'model and fix the type error' },
  { marker: 'biome-ignore', reason: 'fix the lint violation instead of suppressing it' },
];

function extension(path) {
  const separator = path.lastIndexOf('.');
  return separator < 0 ? '' : path.slice(separator);
}

async function sourceFiles(relativeDirectory) {
  const entries = await readdir(new URL(`${relativeDirectory}/`, workspaceRoot), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(relativePath)));
    } else if (entry.isFile() && sourceExtensions.has(extension(entry.name))) {
      files.push(relativePath);
    }
  }
  return files;
}

let violations = 0;
for (const root of sourceRoots) {
  for (const path of await sourceFiles(root)) {
    const contents = await readFile(new URL(path, workspaceRoot), 'utf8');
    for (const policy of forbiddenPolicies) {
      if (contents.includes(policy.marker)) {
        process.stderr.write(`[source-policy] ${path}: ${policy.reason} (${policy.marker})\n`);
        violations += 1;
      }
    }
  }
}

if (violations > 0) {
  process.exitCode = 1;
} else {
  process.stdout.write(
    `[source-policy] verified ${sourceRoots.length} source roots without suppressions or legacy Effect APIs\n`
  );
}
