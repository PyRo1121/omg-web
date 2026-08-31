import { readFile, readdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { posix } from 'node:path';
import { CLI_SERVICE_API_CONTRACT } from '../site/shared/licensing-routes.ts';

const workspaceRoot = new URL('../', import.meta.url);
const sourceRoots = [
  'site/src',
  'site/shared',
  'site-svelte/e2e',
  'site-svelte/src',
  'site/workers/src',
  'site/workers/tests',
  'workers/router/src',
  'workers/releases/src',
];
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.svelte', '.ts', '.tsx']);
const productionWranglerConfigs = [
  'site/wrangler.toml',
  'site/workers/wrangler.toml',
  'workers/router/wrangler.toml',
  'workers/releases/wrangler.toml',
];
const secretVariableName = /(?:API_KEY|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)$/u;
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

async function directoryFiles(relativeDirectory, include) {
  const entries = await readdir(new URL(`${relativeDirectory}/`, workspaceRoot), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await directoryFiles(relativePath, include)));
    } else if (entry.isFile() && include(entry.name)) {
      files.push(relativePath);
    }
  }
  return files;
}

const sourceFiles = relativeDirectory =>
  directoryFiles(relativeDirectory, name => sourceExtensions.has(extension(name)));
const allFiles = relativeDirectory => directoryFiles(relativeDirectory, () => true);

let violations = 0;
const serviceContractPath = 'contracts/service-api-v1.json';
const serviceContract = JSON.parse(
  await readFile(new URL(serviceContractPath, workspaceRoot), 'utf8')
);
if (!isDeepStrictEqual(serviceContract, CLI_SERVICE_API_CONTRACT)) {
  process.stderr.write(
    `[source-policy] ${serviceContractPath}: generated CLI service contract differs from the Worker route registry\n`
  );
  violations += 1;
}

const antiSlopSyncPath = 'tools/oxlint/sync-anti-slop.mjs';
const antiSlopSync = await readFile(new URL(antiSlopSyncPath, workspaceRoot), 'utf8');
if (antiSlopSync.includes('tmpdir')) {
  process.stderr.write(
    `[source-policy] ${antiSlopSyncPath}: network clones belong under ~/.cache/build-targets, not RAM-backed temporary storage\n`
  );
  violations += 1;
}

for (const configPath of productionWranglerConfigs) {
  const config = await readFile(new URL(configPath, workspaceRoot), 'utf8');
  let inPlaintextVariables = false;
  for (const line of config.split('\n')) {
    const section = /^\s*\[([A-Za-z0-9_.-]+)\]\s*$/u.exec(line);
    if (section !== null) {
      inPlaintextVariables = section[1] === 'vars' || section[1]?.endsWith('.vars') === true;
      continue;
    }
    if (!inPlaintextVariables) {
      continue;
    }
    const assignment = /^\s*([A-Z][A-Z0-9_]*)\s*=/u.exec(line);
    if (assignment?.[1] !== undefined && secretVariableName.test(assignment[1])) {
      process.stderr.write(
        `[source-policy] ${configPath}: ${assignment[1]} must use a secret binding, not plaintext [vars]\n`
      );
      violations += 1;
    }
  }
}

const solidManifestPath = 'docs/operations/svelte-production-cutover.md';
const solidManifest = await readFile(new URL(solidManifestPath, workspaceRoot), 'utf8');
const manifestStart = '<!-- solid-deletion-manifest:start -->';
const manifestEnd = '<!-- solid-deletion-manifest:end -->';
const manifestBody = solidManifest.split(manifestStart)[1]?.split(manifestEnd)[0];
const manifestEntries =
  manifestBody
    ?.match(/^site\/src\/[^\n]+$/gm)
    ?.toSorted((left, right) => left.localeCompare(right)) ?? [];
const solidFiles = (await allFiles('site/src')).toSorted((left, right) =>
  left.localeCompare(right)
);
if (!isDeepStrictEqual(manifestEntries, solidFiles)) {
  process.stderr.write(
    `[source-policy] ${solidManifestPath}: Solid deletion manifest must list every current site/src file exactly once\n`
  );
  violations += 1;
}

for (const root of sourceRoots) {
  for (const path of await sourceFiles(root)) {
    const contents = await readFile(new URL(path, workspaceRoot), 'utf8');
    if (root !== 'site/src') {
      const importPattern = /(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/gu;
      for (const match of contents.matchAll(importPattern)) {
        const specifier = match[1];
        if (specifier?.startsWith('.') !== true) continue;
        const resolved = posix.normalize(posix.join(posix.dirname(path), specifier));
        if (resolved === 'site/src' || resolved.startsWith('site/src/')) {
          process.stderr.write(
            `[source-policy] ${path}: external production caller still imports Solid source (${specifier})\n`
          );
          violations += 1;
        }
      }
    }
    if (contents.includes('localStorage.getItem') && contents.includes('JSON.parse(')) {
      process.stderr.write(
        `[source-policy] ${path}: localStorage values must be length-bounded before parsing through the shared browser-storage boundary\n`
      );
      violations += 1;
    }
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
    `[source-policy] verified ${sourceRoots.length} source roots and ${productionWranglerConfigs.length} production configs\n`
  );
}
