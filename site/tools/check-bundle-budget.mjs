import { access, readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

// vinxi's internal client-asset layout; if this path ever changes the check
// below fails with a targeted message instead of an empty-directory scan.
const assetsDirectory = new URL('../.vinxi/build/client/_build/assets/', import.meta.url);
const MAX_JAVASCRIPT_CHUNK_BYTES = 500_000;
const MAX_JAVASCRIPT_CHUNK_GZIP_BYTES = 130_000;
const MAX_TOTAL_JAVASCRIPT_GZIP_BYTES = 400_000;
const MAX_STYLESHEET_GZIP_BYTES = 30_000;

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
    `[bundle-budget] ${javascriptNames.length} JavaScript chunks total ${totalJavascriptGzipBytes} gzip bytes; all budgets pass\n`
  );
}
