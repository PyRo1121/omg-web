import { access, readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

// vinxi's internal client-asset layout; if this path ever changes the check
// below fails with a targeted message instead of an empty-directory scan.
const assetsDirectory = new URL('../.vinxi/build/client/_build/assets/', import.meta.url);
const MAX_JAVASCRIPT_CHUNK_BYTES = 500_000;
const MAX_JAVASCRIPT_CHUNK_GZIP_BYTES = 130_000;
const MAX_TOTAL_JAVASCRIPT_GZIP_BYTES = 400_000;
const MAX_ENTRY_MODULEPRELOAD_GZIP_BYTES = 110_000;
const MAX_STYLESHEET_GZIP_BYTES = 30_000;
const entryHtml = new URL('../dist/index.html', import.meta.url);
// SolidStart's JavaScript serializer emits an indirect `(0, eval)(...)`
// deserializer. `new Function(...)` is the other constructor blocked by the
// same CSP policy. Do not match ordinary object methods named `eval` (Effect's
// runtime legitimately uses that method name without evaluating source text).
const DYNAMIC_CODE_PATTERN = /\(0,\s*eval\)\s*\(|\bnew\s+Function\s*\(/;

function reportFailure(message) {
  process.stderr.write(`[bundle-budget] ${message}\n`);
  process.exitCode = 1;
}

try {
  await access(assetsDirectory);
} catch {
  reportFailure(
    `client asset directory not found (${assetsDirectory.pathname}); the vinxi output layout may have changed or the production build did not run`
  );
  process.exit(1);
}

const assetNames = await readdir(assetsDirectory);
const javascriptNames = assetNames.filter(name => name.endsWith('.js')).toSorted();
const stylesheetNames = assetNames.filter(name => name.endsWith('.css')).toSorted();

if (javascriptNames.length === 0) {
  reportFailure('no client JavaScript artifacts found; run the production build first');
}

if (stylesheetNames.length === 0) {
  reportFailure('no client stylesheet artifacts found; expected at least one CSS bundle');
}

let totalJavascriptGzipBytes = 0;
for (const name of javascriptNames) {
  const bytes = await readFile(new URL(name, assetsDirectory));
  const gzipBytes = gzipSync(bytes).byteLength;
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

let entryModulepreloadGzipBytes = 0;
try {
  const html = await readFile(entryHtml, 'utf8');
  const preloadedNames = new Set();
  for (const match of html.matchAll(/<link\b[^>]*>/g)) {
    const tag = match[0];
    if (!/\brel=["']modulepreload["']/.test(tag)) continue;
    const href = tag.match(/\bhref=["']\/_build\/assets\/([^"']+)["']/)?.[1];
    if (href !== undefined) preloadedNames.add(href);
  }
  if (preloadedNames.size === 0) {
    reportFailure(
      'landing page has no modulepreload assets; generated HTML shape may have changed'
    );
  }
  for (const name of preloadedNames) {
    const bytes = await readFile(new URL(name, assetsDirectory));
    entryModulepreloadGzipBytes += gzipSync(bytes).byteLength;
  }
  if (entryModulepreloadGzipBytes > MAX_ENTRY_MODULEPRELOAD_GZIP_BYTES) {
    reportFailure(
      `landing modulepreloads total ${entryModulepreloadGzipBytes} gzip bytes; maximum is ${MAX_ENTRY_MODULEPRELOAD_GZIP_BYTES}`
    );
  }
} catch (error) {
  reportFailure(`could not measure landing modulepreloads: ${String(error)}`);
}

for (const name of stylesheetNames) {
  const bytes = await readFile(new URL(name, assetsDirectory));
  const gzipBytes = gzipSync(bytes).byteLength;
  if (gzipBytes > MAX_STYLESHEET_GZIP_BYTES) {
    reportFailure(
      `${name} is ${gzipBytes} gzip bytes; maximum stylesheet is ${MAX_STYLESHEET_GZIP_BYTES}`
    );
  }
}

if (process.exitCode === undefined) {
  process.stdout.write(
    `[bundle-budget] ${javascriptNames.length} JavaScript chunks total ${totalJavascriptGzipBytes} gzip bytes; landing modulepreloads ${entryModulepreloadGzipBytes} gzip bytes; all budgets pass\n`
  );
}
