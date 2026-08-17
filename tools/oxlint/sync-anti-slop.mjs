#!/usr/bin/env node
/**
 * Sync the vendored anti-slop Oxlint plugin with the upstream repository.
 *
 * The plugin rules live at https://github.com/dmmulroy/anti-slop. This project
 * vendors them under tools/oxlint/anti-slop so the lint gate (oxlint.config.ts)
 * can load them as a local jsPlugin without an npm dependency.
 *
 * Usage:
 *   node tools/oxlint/sync-anti-slop.mjs          # pull upstream files (overwrites vendored copies)
 *   node tools/oxlint/sync-anti-slop.mjs --check  # verify vendored files match upstream (exit 1 on drift)
 *
 * Only the files the plugin needs at runtime are pulled:
 *   - src/index.ts                      -> anti-slop/index.ts
 *   - src/rules/*.ts   (excl. tests)    -> anti-slop/rules/*.ts
 *   - src/shared/*.ts                   -> anti-slop/shared/*.ts
 *
 * Upstream test files (.test.ts) are intentionally not vendored; the project
 * validates rule behavior against the real codebase instead.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM_REPO = 'https://github.com/dmmulroy/anti-slop.git';
const UPSTREAM_SRC = 'src';

const here = dirname(fileURLToPath(import.meta.url));
const vendoredRoot = join(here, 'anti-slop');

const checkOnly = process.argv.includes('--check');

/** Files that are pulled from upstream, mapped from upstream path to vendored path. */
function upstreamFiles(upstreamRoot) {
  const files = [];
  for (const dir of ['rules', 'shared']) {
    for (const name of readdirSync(join(upstreamRoot, dir))) {
      if (name.endsWith('.test.ts')) continue;
      if (!name.endsWith('.ts')) continue;
      files.push(join(dir, name));
    }
  }
  files.push('index.ts');
  return files.map(p => ({ upstream: join(upstreamRoot, p), vendored: join(vendoredRoot, p) }));
}

function cloneUpstream() {
  const dir = mkdtempSync(join(tmpdir(), 'anti-slop-upstream-'));
  try {
    execFileSync('git', ['clone', '--depth', '1', '--quiet', UPSTREAM_REPO, dir], {
      stdio: 'inherit',
    });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    console.error(`[anti-slop] failed to clone ${UPSTREAM_REPO}: ${error.message}`);
    process.exit(1);
  }
  return dir;
}

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function syncFile(upstream, vendored) {
  const upstreamContent = readFileSync(upstream, 'utf8');
  const localContent = read(vendored);
  if (localContent === upstreamContent) return 'up-to-date';
  writeFileSync(vendored, upstreamContent);
  return 'updated';
}

function main() {
  const upstreamRoot = cloneUpstream();
  const srcRoot = join(upstreamRoot, UPSTREAM_SRC);
  const files = upstreamFiles(srcRoot);

  if (!existsSync(vendoredRoot)) {
    console.error(`[anti-slop] vendored root missing: ${vendoredRoot}`);
    rmSync(upstreamRoot, { recursive: true, force: true });
    process.exit(1);
  }

  let changed = 0;
  let removed = 0;
  for (const { upstream, vendored } of files) {
    const rel = relative(vendoredRoot, vendored);
    const status = syncFile(upstream, vendored);
    console.log(`[anti-slop] ${status.padEnd(10)} ${rel}`);
    if (status === 'updated') changed += 1;
  }

  // Mirror deletions: drop vendored files that no longer exist upstream.
  const kept = new Set(files.map(({ vendored }) => vendored));
  for (const dir of ['rules', 'shared']) {
    const abs = join(vendoredRoot, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      const file = join(abs, name);
      if (kept.has(file) || !name.endsWith('.ts')) continue;
      rmSync(file);
      console.log(`[anti-slop] removed    ${relative(vendoredRoot, file)}`);
      removed += 1;
    }
  }

  rmSync(upstreamRoot, { recursive: true, force: true });

  if (checkOnly) {
    if (changed > 0 || removed > 0) {
      console.error(
        `[anti-slop] vendored plugin is out of sync with upstream (${changed} changed, ${removed} removed). Run: npm run sync:anti-slop`
      );
      process.exit(1);
    }
    console.log('[anti-slop] vendored plugin is in sync with upstream.');
    return;
  }

  console.log(
    changed + removed === 0
      ? '[anti-slop] vendored plugin is already up to date.'
      : `[anti-slop] synced ${changed} file(s), removed ${removed} file(s).`
  );
}

main();
