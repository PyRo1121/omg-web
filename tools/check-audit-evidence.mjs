import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';

const findingsRoot = resolve('piolium/findings');
const scriptHashes = new Map();
let manifestCount = 0;

async function exists(path) {
  return access(path).then(
    () => true,
    () => false
  );
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

function fail(message) {
  process.stderr.write(`[audit-evidence] ${message}\n`);
  process.exitCode = 1;
}

function insideFindings(path) {
  return path === findingsRoot || path.startsWith(`${findingsRoot}${sep}`);
}

for (const path of await filesUnder(findingsRoot)) {
  if (['.sh', '.ts'].includes(extname(path))) {
    const digest = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    const previous = scriptHashes.get(digest);
    if (previous !== undefined) {
      fail(
        `exact script duplicate: ${relative(findingsRoot, previous)} and ${relative(findingsRoot, path)}`
      );
    } else {
      scriptHashes.set(digest, path);
    }
  }

  if (!['manifest.json', 'script-manifest.json'].includes(basename(path))) {
    continue;
  }
  manifestCount += 1;
  const document = JSON.parse(await readFile(path, 'utf8'));
  try {
    assert.equal(document.version, 1);
    assert.ok(Array.isArray(document.canonicalScripts));
    for (const entry of document.canonicalScripts) {
      assert.match(entry.removedCopy, /^[^/\\]+$/);
      assert.match(entry.canonical, /^.+$/);
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    }
  } catch {
    fail(`invalid manifest shape: ${relative(findingsRoot, path)}`);
    continue;
  }
  for (const entry of document.canonicalScripts) {
    const removedPath = resolve(dirname(path), entry.removedCopy);
    const canonicalPath = resolve(dirname(path), entry.canonical);
    if (!insideFindings(canonicalPath)) {
      fail(`canonical path escapes findings: ${relative(findingsRoot, path)}`);
      continue;
    }
    if (await exists(removedPath)) {
      fail(`removed copy still exists: ${relative(findingsRoot, removedPath)}`);
    }
    if (!(await exists(canonicalPath))) {
      fail(`canonical script is missing: ${relative(findingsRoot, canonicalPath)}`);
      continue;
    }
    const actual = createHash('sha256')
      .update(await readFile(canonicalPath))
      .digest('hex');
    if (actual !== entry.sha256) {
      fail(`canonical hash changed: ${relative(findingsRoot, canonicalPath)}`);
    }
  }
}

if (process.exitCode === undefined) {
  process.stdout.write(
    `[audit-evidence] verified ${manifestCount} manifests and ${scriptHashes.size} unique scripts\n`
  );
}
