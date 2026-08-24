#!/usr/bin/env node
/**
 * Sync the vendored anti-slop Oxlint plugins with an audited upstream commit.
 *
 * Usage:
 *   node tools/oxlint/sync-anti-slop.mjs          # overwrite vendored files from the pinned commit
 *   node tools/oxlint/sync-anti-slop.mjs --check  # verify vendored files against the local
 *                                                 # anti-slop.sha256 manifest WITHOUT network access
 *
 * The check mode is intentionally offline so CI never depends on a third-party
 * repository being reachable. Integrity against upstream is established once per
 * sync (the pinned commit is verified via git rev-parse) and then captured in
 * the committed manifest; later runs only prove the worktree has not drifted.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM_REPO = 'https://github.com/dmmulroy/anti-slop.git';
const UPSTREAM_COMMIT = '6d538555cb151d4121ed51a27db81890eacf8ae9';
const UPSTREAM_SRC = 'src';
const MANAGED_DIRECTORIES = ['rules', 'shared', 'effect/rules'];

const here = dirname(fileURLToPath(import.meta.url));
const vendoredRoot = join(here, 'anti-slop');
const manifestPath = join(here, 'anti-slop.sha256');
const checkOnly = process.argv.includes('--check');

function output(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Files required by the generic and Effect plugins at runtime, relative to the source root. */
function managedPaths(sourceRoot) {
  const paths = ['index.ts', 'effect/index.ts'];
  for (const directory of MANAGED_DIRECTORIES) {
    for (const name of readdirSync(join(sourceRoot, directory))) {
      if (name.endsWith('.test.ts') || !name.endsWith('.ts')) continue;
      paths.push(join(directory, name));
    }
  }
  return paths.toSorted();
}

function parseManifest(contents) {
  const entries = new Map();
  for (const line of contents.trim().split('\n')) {
    // sha256sum format: exactly two spaces between digest and relative path.
    const match = /^([0-9a-f]{64})  (\S.*)$/.exec(line);
    if (match === null) throw new Error(`invalid manifest line: ${line}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function checkoutUpstream() {
  const directory = mkdtempSync(join(tmpdir(), 'anti-slop-upstream-'));
  try {
    execFileSync('git', ['init', '--quiet', directory], { stdio: 'ignore' });
    execFileSync(
      'git',
      ['-C', directory, 'fetch', '--depth', '1', '--quiet', UPSTREAM_REPO, UPSTREAM_COMMIT],
      { stdio: 'ignore' }
    );
    execFileSync('git', ['-C', directory, 'checkout', '--detach', '--quiet', 'FETCH_HEAD'], {
      stdio: 'ignore',
    });
    const revision = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    if (revision !== UPSTREAM_COMMIT) {
      throw new Error(`expected ${UPSTREAM_COMMIT}, received ${revision}`);
    }
    return directory;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`failed to fetch anti-slop ${UPSTREAM_COMMIT}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

function readVendored(relativePath) {
  return existsSync(join(vendoredRoot, relativePath))
    ? sha256(join(vendoredRoot, relativePath))
    : null;
}

function reconcileFile(upstreamFile, vendoredFile) {
  const upstreamContent = readFileSync(upstreamFile, 'utf8');
  let localContent;
  try {
    localContent = readFileSync(vendoredFile, 'utf8');
  } catch {
    localContent = null;
  }
  if (localContent === upstreamContent) return 'up-to-date';

  mkdirSync(dirname(vendoredFile), { recursive: true });
  writeFileSync(vendoredFile, upstreamContent);
  return 'updated';
}

function unexpectedManagedFiles(managedRelativePaths) {
  const kept = new Set(managedRelativePaths.map(path => join(vendoredRoot, path)));
  const unexpected = [];
  for (const directory of MANAGED_DIRECTORIES) {
    const absoluteDirectory = join(vendoredRoot, directory);
    if (!existsSync(absoluteDirectory)) continue;
    for (const name of readdirSync(absoluteDirectory)) {
      const file = join(absoluteDirectory, name);
      if (kept.has(file) || !name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      unexpected.push(file);
    }
  }
  return unexpected;
}

function runCheck() {
  if (!existsSync(vendoredRoot)) {
    throw new Error(`vendored root missing: ${vendoredRoot}`);
  }
  if (!existsSync(manifestPath)) {
    throw new Error(`hash manifest missing: ${manifestPath}; run npm run sync:anti-slop`);
  }
  const manifest = parseManifest(readFileSync(manifestPath, 'utf8'));
  let drifted = 0;

  for (const [relativePath, expected] of manifest.entries()) {
    const actual = readVendored(relativePath);
    if (actual === expected) {
      output(
        `[anti-slop] ok         ${relative('tools/oxlint', join(vendoredRoot, relativePath))}`
      );
      continue;
    }
    drifted += 1;
    output(
      `[anti-slop] ${actual === null ? 'missing   ' : 'drifted   '} ${relative(
        'tools/oxlint',
        join(vendoredRoot, relativePath)
      )}`
    );
  }

  const unexpectedFiles = unexpectedManagedFiles([...manifest.keys()]);
  for (const file of unexpectedFiles) {
    output(`[anti-slop] unexpected ${relative(vendoredRoot, file)}`);
  }

  if (drifted + unexpectedFiles.length > 0) {
    throw new Error(
      `vendored plugins differ from manifest ${UPSTREAM_COMMIT} (${drifted} changed, ${unexpectedFiles.length} unexpected). Run: npm run sync:anti-slop`
    );
  }

  output(`[anti-slop] vendored plugins match manifest for ${UPSTREAM_COMMIT}.`);
}

function runSync() {
  if (!existsSync(vendoredRoot)) {
    throw new Error(`vendored root missing: ${vendoredRoot}`);
  }

  const upstreamDirectory = checkoutUpstream();
  try {
    const upstreamRoot = join(upstreamDirectory, UPSTREAM_SRC);
    const managed = managedPaths(upstreamRoot);
    let changed = 0;

    for (const relativePath of managed) {
      const status = reconcileFile(
        join(upstreamRoot, relativePath),
        join(vendoredRoot, relativePath)
      );
      output(`[anti-slop] ${status.padEnd(10)} ${relativePath}`);
      if (status !== 'up-to-date') changed += 1;
    }

    const unexpectedFiles = unexpectedManagedFiles(managed);
    for (const file of unexpectedFiles) {
      rmSync(file);
      output(`[anti-slop] removed    ${relative(vendoredRoot, file)}`);
    }

    const manifestLines = managed
      .map(path => `${sha256(join(vendoredRoot, path))}  ${path.replaceAll('\\', '/')}`)
      .toSorted((left, right) => left.split('  ')[1].localeCompare(right.split('  ')[1]));
    writeFileSync(manifestPath, `${manifestLines.join('\n')}\n`);

    output(
      changed + unexpectedFiles.length === 0
        ? '[anti-slop] vendored plugins are already up to date.'
        : `[anti-slop] synced ${changed} file(s), removed ${unexpectedFiles.length} file(s); manifest refreshed.`
    );
  } finally {
    rmSync(upstreamDirectory, { recursive: true, force: true });
  }
}

function main() {
  try {
    if (checkOnly) {
      runCheck();
    } else {
      runSync();
    }
  } catch (error) {
    fail(`[anti-slop] ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

main();
