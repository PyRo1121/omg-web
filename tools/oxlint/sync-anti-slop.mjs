#!/usr/bin/env node
/**
 * Sync the vendored anti-slop Oxlint plugins with an audited upstream commit.
 *
 * Usage:
 *   node tools/oxlint/sync-anti-slop.mjs          # overwrite vendored files from the pinned commit
 *   node tools/oxlint/sync-anti-slop.mjs --check  # compare without modifying the worktree
 */

import { execFileSync } from 'node:child_process';
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

/** Files required by the generic and Effect plugins at runtime. */
function upstreamFiles(upstreamRoot) {
  const paths = ['index.ts', 'effect/index.ts'];
  for (const directory of MANAGED_DIRECTORIES) {
    for (const name of readdirSync(join(upstreamRoot, directory))) {
      if (name.endsWith('.test.ts') || !name.endsWith('.ts')) continue;
      paths.push(join(directory, name));
    }
  }
  return paths.map(path => ({
    upstream: join(upstreamRoot, path),
    vendored: join(vendoredRoot, path),
  }));
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

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function reconcileFile(upstream, vendored) {
  const upstreamContent = readFileSync(upstream, 'utf8');
  const localContent = read(vendored);
  if (localContent === upstreamContent) return 'up-to-date';
  if (checkOnly) return 'drifted';

  mkdirSync(dirname(vendored), { recursive: true });
  writeFileSync(vendored, upstreamContent);
  return 'updated';
}

function reconcileUnexpectedFiles(files) {
  const kept = new Set(files.map(({ vendored }) => vendored));
  let unexpected = 0;

  for (const directory of MANAGED_DIRECTORIES) {
    const absoluteDirectory = join(vendoredRoot, directory);
    if (!existsSync(absoluteDirectory)) continue;

    for (const name of readdirSync(absoluteDirectory)) {
      const file = join(absoluteDirectory, name);
      if (kept.has(file) || !name.endsWith('.ts')) continue;

      unexpected += 1;
      if (checkOnly) {
        output(`[anti-slop] unexpected ${relative(vendoredRoot, file)}`);
      } else {
        rmSync(file);
        output(`[anti-slop] removed    ${relative(vendoredRoot, file)}`);
      }
    }
  }

  return unexpected;
}

function main() {
  let upstreamDirectory;
  try {
    if (!existsSync(vendoredRoot)) {
      throw new Error(`vendored root missing: ${vendoredRoot}`);
    }

    upstreamDirectory = checkoutUpstream();
    const files = upstreamFiles(join(upstreamDirectory, UPSTREAM_SRC));
    let changed = 0;

    for (const { upstream, vendored } of files) {
      const status = reconcileFile(upstream, vendored);
      output(`[anti-slop] ${status.padEnd(10)} ${relative(vendoredRoot, vendored)}`);
      if (status !== 'up-to-date') changed += 1;
    }

    const unexpected = reconcileUnexpectedFiles(files);
    if (checkOnly && changed + unexpected > 0) {
      throw new Error(
        `vendored plugins differ from ${UPSTREAM_COMMIT} (${changed} changed, ${unexpected} unexpected). Run: npm run sync:anti-slop`
      );
    }

    output(
      checkOnly
        ? `[anti-slop] vendored plugins match ${UPSTREAM_COMMIT}.`
        : changed + unexpected === 0
          ? '[anti-slop] vendored plugins are already up to date.'
          : `[anti-slop] synced ${changed} file(s), removed ${unexpected} file(s).`
    );
  } catch (error) {
    fail(`[anti-slop] ${errorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    if (upstreamDirectory !== undefined) {
      rmSync(upstreamDirectory, { recursive: true, force: true });
    }
  }
}

main();
