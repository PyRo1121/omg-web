import { access, readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Schema } from 'effect';

const clientDirectory = fileURLToPath(new URL('../.svelte-kit/output/client/', import.meta.url));
const immutableDirectory = resolve(clientDirectory, '_app/immutable');
const manifestPath = resolve(clientDirectory, '.vite/manifest.json');
const generatedNodesDirectory = fileURLToPath(
  new URL('../.svelte-kit/generated/client-optimized/nodes/', import.meta.url)
);
const MAX_JAVASCRIPT_CHUNK_BYTES = 500_000;
const MAX_JAVASCRIPT_CHUNK_GZIP_BYTES = 130_000;
const MAX_TOTAL_JAVASCRIPT_GZIP_BYTES = 400_000;
const MAX_ENTRY_JAVASCRIPT_GZIP_BYTES = 110_000;
const MAX_STYLESHEET_GZIP_BYTES = 30_000;
const DYNAMIC_CODE_PATTERN = /\(0,\s*eval\)\s*\(|\bnew\s+Function\s*\(/u;

const ManifestEntrySchema = Schema.Struct({
  file: Schema.String,
  src: Schema.optional(Schema.String),
  imports: Schema.optional(Schema.Array(Schema.String)),
  css: Schema.optional(Schema.Array(Schema.String)),
});
const ManifestSchema = Schema.Record(Schema.String, ManifestEntrySchema);
const ManifestJsonSchema = Schema.fromJsonString(ManifestSchema);

function reportFailure(message) {
  process.stderr.write(`[bundle-budget] ${message}\n`);
  process.exitCode = 1;
}

function clientRelativePath(path) {
  return relative(clientDirectory, path).split(sep).join('/');
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function requireBuildDirectory() {
  try {
    await access(immutableDirectory);
    await access(manifestPath);
    await access(generatedNodesDirectory);
  } catch {
    reportFailure(
      'Svelte client build output is missing; run the production build before checking its bundle budget'
    );
    process.exit(1);
  }
}

async function readManifest() {
  const contents = await readFile(manifestPath, 'utf8');
  try {
    return Schema.decodeUnknownSync(ManifestJsonSchema)(contents);
  } catch (error) {
    reportFailure(`could not decode the Svelte client manifest: ${String(error)}`);
    process.exit(1);
  }
}

function manifestKeyForSource(manifest, source, description) {
  const matches = Object.entries(manifest).filter(([, entry]) => entry.src === source);
  if (matches.length !== 1) {
    reportFailure(
      `expected one ${description} manifest entry for ${source}; found ${matches.length}`
    );
    return undefined;
  }
  return matches[0]?.[0];
}

async function generatedNodeSource(routeSource, description) {
  const matches = [];
  for (const name of await readdir(generatedNodesDirectory)) {
    if (!/^\d+\.js$/u.test(name)) continue;
    const contents = await readFile(resolve(generatedNodesDirectory, name), 'utf8');
    if (contents.includes(`from "../../../../${routeSource}"`)) {
      matches.push(`.svelte-kit/generated/client-optimized/nodes/${name}`);
    }
  }
  if (matches.length !== 1) {
    reportFailure(
      `expected one generated ${description} node for ${routeSource}; found ${matches.length}`
    );
    return undefined;
  }
  return matches[0];
}

function importedJavascript(manifest, entryKeys) {
  const files = new Set();
  const visited = new Set();
  const visit = key => {
    if (visited.has(key)) return;
    visited.add(key);
    const entry = manifest[key];
    if (entry === undefined) {
      reportFailure(`client manifest import ${key} is missing`);
      return;
    }
    if (entry.file.endsWith('.js')) {
      files.add(entry.file);
    }
    for (const importedKey of entry.imports ?? []) {
      visit(importedKey);
    }
  };
  for (const key of entryKeys) {
    if (key !== undefined) visit(key);
  }
  return files;
}

await requireBuildDirectory();
const manifest = await readManifest();
const immutableFiles = await filesUnder(immutableDirectory);
const javascriptPaths = immutableFiles.filter(path => path.endsWith('.js')).toSorted();
const stylesheetPaths = immutableFiles.filter(path => path.endsWith('.css')).toSorted();

if (javascriptPaths.length === 0) {
  reportFailure('no client JavaScript artifacts found in the Svelte production build');
}
if (stylesheetPaths.length === 0) {
  reportFailure('no client stylesheet artifacts found in the Svelte production build');
}

let totalJavascriptGzipBytes = 0;
for (const path of javascriptPaths) {
  const bytes = await readFile(path);
  const gzipBytes = gzipSync(bytes).byteLength;
  const name = clientRelativePath(path);
  totalJavascriptGzipBytes += gzipBytes;

  if (DYNAMIC_CODE_PATTERN.test(bytes.toString('utf8'))) {
    reportFailure(`${name} contains a dynamic code constructor, which the production CSP blocks`);
  }
  if (bytes.byteLength > MAX_JAVASCRIPT_CHUNK_BYTES) {
    reportFailure(
      `${name} is ${bytes.byteLength} bytes; maximum raw JavaScript chunk is ${MAX_JAVASCRIPT_CHUNK_BYTES}`
    );
  }
  if (gzipBytes > MAX_JAVASCRIPT_CHUNK_GZIP_BYTES) {
    reportFailure(
      `${name} is ${gzipBytes} gzip bytes; maximum JavaScript chunk is ${MAX_JAVASCRIPT_CHUNK_GZIP_BYTES}`
    );
  }
}

if (totalJavascriptGzipBytes > MAX_TOTAL_JAVASCRIPT_GZIP_BYTES) {
  reportFailure(
    `client JavaScript totals ${totalJavascriptGzipBytes} gzip bytes; maximum is ${MAX_TOTAL_JAVASCRIPT_GZIP_BYTES}`
  );
}

const rootLayoutSource = await generatedNodeSource('src/routes/+layout.svelte', 'root layout');
const rootPageSource = await generatedNodeSource('src/routes/+page.svelte', 'root page');
const landingEntryKeys = [
  manifestKeyForSource(
    manifest,
    '.svelte-kit/generated/client-optimized/app.js',
    'Svelte application'
  ),
  manifestKeyForSource(
    manifest,
    'node_modules/@sveltejs/kit/src/runtime/client/entry.js',
    'Svelte client start'
  ),
  rootLayoutSource === undefined
    ? undefined
    : manifestKeyForSource(manifest, rootLayoutSource, 'root layout'),
  rootPageSource === undefined
    ? undefined
    : manifestKeyForSource(manifest, rootPageSource, 'root page'),
];
const landingJavascript = importedJavascript(manifest, landingEntryKeys);
let landingJavascriptGzipBytes = 0;
for (const name of landingJavascript) {
  landingJavascriptGzipBytes += gzipSync(await readFile(resolve(clientDirectory, name))).byteLength;
}
if (landingJavascript.size === 0) {
  reportFailure(
    'landing-page JavaScript closure is empty; the Svelte manifest shape may have changed'
  );
}
if (landingJavascriptGzipBytes > MAX_ENTRY_JAVASCRIPT_GZIP_BYTES) {
  reportFailure(
    `landing JavaScript totals ${landingJavascriptGzipBytes} gzip bytes; maximum is ${MAX_ENTRY_JAVASCRIPT_GZIP_BYTES}`
  );
}

for (const path of stylesheetPaths) {
  const gzipBytes = gzipSync(await readFile(path)).byteLength;
  if (gzipBytes > MAX_STYLESHEET_GZIP_BYTES) {
    reportFailure(
      `${clientRelativePath(path)} is ${gzipBytes} gzip bytes; maximum stylesheet is ${MAX_STYLESHEET_GZIP_BYTES}`
    );
  }
}

if (process.exitCode === undefined) {
  process.stdout.write(
    `[bundle-budget] ${javascriptPaths.length} Svelte JavaScript chunks total ${totalJavascriptGzipBytes} gzip bytes; landing closure ${landingJavascriptGzipBytes} gzip bytes across ${landingJavascript.size} chunks; all budgets pass\n`
  );
}
