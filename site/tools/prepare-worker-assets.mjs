import { createHash } from 'node:crypto';
import { access, appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicyWithScriptHashes } from '../../shared/security-headers.ts';

const distRoot = new URL('../dist/', import.meta.url);
const distPath = fileURLToPath(distRoot);
const INLINE_SCRIPT_PATTERN = /<script(?<attributes>\s[^>]*)?>(?<body>[\s\S]*?)<\/script>/giu;

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await htmlFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path);
    }
  }
  return files;
}

function routeForHtml(path) {
  const pathFromDist = relative(distPath, path).split(sep).join('/');
  if (pathFromDist === 'index.html') {
    return '/';
  }
  return `/${dirname(pathFromDist).split(sep).join('/')}/`;
}

function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(INLINE_SCRIPT_PATTERN)) {
    const attributes = match.groups?.attributes ?? '';
    const body = match.groups?.body ?? '';
    if (/\ssrc\s*=/iu.test(attributes) || body.length === 0) {
      continue;
    }
    hashes.add(createHash('sha256').update(body).digest('base64'));
  }
  return [...hashes].toSorted();
}

// Wrangler includes the built main module in generated types only when dist
// exists. Type drift checks therefore start from the same clean state as CI.
if (process.argv.includes('--clean')) {
  await rm(distRoot, { recursive: true, force: true });
}
await mkdir(distRoot, { recursive: true });

// Workers Static Assets must not serve the server bundle as a static file.
await writeFile(new URL('.assetsignore', distRoot), '_worker.js\n');

const headersPath = fileURLToPath(new URL('_headers', distRoot));
const headersExist = await access(headersPath).then(
  () => true,
  () => false
);
let prerenderedCount = 0;
if (headersExist) {
  const blocks = [];
  for (const path of await htmlFiles(distPath)) {
    const hashes = inlineScriptHashes(await readFile(path, 'utf8'));
    blocks.push(
      `${routeForHtml(path)}\n  Content-Security-Policy: ${contentSecurityPolicyWithScriptHashes(hashes)}\n`
    );
    prerenderedCount += 1;
  }
  if (blocks.length > 0) {
    await appendFile(
      headersPath,
      `\n# Generated CSP hashes for prerendered HTML.\n${blocks.join('\n')}`
    );
  }
}

process.stdout.write(
  `[prepare-worker-assets] wrote dist/.assetsignore and ${prerenderedCount} prerendered CSP policies\n`
);
