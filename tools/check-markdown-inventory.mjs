import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER = 'repo\tpath\tscope\tdisposition\tnote';

export function parseInventory(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0 || lines[0] !== HEADER) {
    throw new Error(`inventory header must be ${JSON.stringify(HEADER)}`);
  }

  return lines.slice(1).map((line, index) => {
    const fields = line.split('\t');
    if (fields.length !== 5) {
      throw new Error(`inventory line ${index + 2} must contain five tab-separated fields`);
    }
    const [repo, path, scope, disposition, note] = fields;
    return { repo, path, scope, disposition, note };
  });
}

function rowKey(repo, path) {
  return `${repo}\t${path}`;
}

function defaultRow(repo, path) {
  if (repo === 'omg-web' && path.startsWith('piolium/')) {
    return {
      repo,
      path,
      scope: 'excluded',
      disposition: 'excluded',
      note: 'piolium/** is outside the documentation program',
    };
  }
  return { repo, path, scope: 'first-party', disposition: 'pending', note: '' };
}

export function mergeInventory(existingRows, trackedPathsByRepo) {
  const knownKeys = new Set();
  for (const row of existingRows) {
    const key = rowKey(row.repo, row.path);
    if (knownKeys.has(key)) throw new Error(`duplicate inventory row for ${row.repo}:${row.path}`);
    knownKeys.add(key);
  }

  const rows = [...existingRows];
  const added = [];
  for (const [repo, trackedPaths] of trackedPathsByRepo) {
    for (const path of trackedPaths.toSorted()) {
      const key = rowKey(repo, path);
      if (knownKeys.has(key)) continue;
      const row = defaultRow(repo, path);
      knownKeys.add(key);
      rows.push(row);
      added.push(row);
    }
  }

  const stale = existingRows.filter(row => {
    const trackedPaths = trackedPathsByRepo.get(row.repo);
    return trackedPaths !== undefined && !trackedPaths.includes(row.path);
  });
  return { rows, added, stale };
}

export function validateInventory(rows, trackedPathsByRepo, { final }) {
  const failures = [];
  const seen = new Set();
  const trackedSets = new Map(
    [...trackedPathsByRepo].map(([repo, paths]) => [repo, new Set(paths)])
  );

  for (const row of rows) {
    const key = rowKey(row.repo, row.path);
    if (seen.has(key)) failures.push(`duplicate inventory row for ${row.repo}:${row.path}`);
    seen.add(key);

    if (row.repo !== 'omg' && row.repo !== 'omg-web') {
      failures.push(`unknown repository ${JSON.stringify(row.repo)} for ${row.path}`);
    }
    const pathSegments = row.path.split('/');
    if (
      row.path.length === 0 ||
      row.path.startsWith('/') ||
      row.path.includes('\\') ||
      pathSegments.includes('..')
    ) {
      failures.push(`invalid path for ${row.repo}:${row.path}`);
    }
    if (row.scope !== 'first-party' && row.scope !== 'excluded') {
      failures.push(`unknown scope ${JSON.stringify(row.scope)} for ${row.repo}:${row.path}`);
    }
    if (!['pending', 'changed', 'reviewed', 'excluded'].includes(row.disposition)) {
      failures.push(
        `unknown disposition ${JSON.stringify(row.disposition)} for ${row.repo}:${row.path}`
      );
    }
    if ((row.scope === 'excluded') !== (row.disposition === 'excluded')) {
      failures.push(
        `excluded scope and disposition must appear together for ${row.repo}:${row.path}`
      );
    }
    if (row.note.includes('\t') || row.note.includes('\n') || row.note.includes('\r')) {
      failures.push(`evidence note must be one TSV field for ${row.repo}:${row.path}`);
    }
    if (row.disposition !== 'pending' && row.note.trim().length === 0) {
      failures.push(`evidence note is required for ${row.repo}:${row.path}`);
    }
    if (final && row.scope === 'first-party' && row.disposition === 'pending') {
      failures.push(`pending review for ${row.repo}:${row.path}`);
    }

    const tracked = trackedSets.get(row.repo);
    if (tracked !== undefined && !tracked.has(row.path)) {
      failures.push(`stale inventory row for ${row.repo}:${row.path}`);
    }
  }

  for (const [repo, trackedPaths] of trackedSets) {
    for (const path of trackedPaths) {
      if (!seen.has(rowKey(repo, path))) {
        failures.push(`missing inventory row for ${repo}:${path}`);
      }
    }
  }
  return failures.toSorted();
}

export function listTrackedMarkdown(repoPath) {
  const output = execFileSync('git', ['-C', repoPath, 'ls-files', '-z', '--', '*.md']);
  return output
    .toString('utf8')
    .split('\0')
    .filter(path => path.length > 0)
    .toSorted();
}

export function serializeInventory(rows) {
  const sortedRows = rows.toSorted((left, right) => {
    const leftKey = `${left.repo}\t${left.path}`;
    const rightKey = `${right.repo}\t${right.path}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const lines = sortedRows.map(row =>
    [row.repo, row.path, row.scope, row.disposition, row.note].join('\t')
  );
  return `${[HEADER, ...lines].join('\n')}\n`;
}

class UsageError extends Error {}

function parseArgs(argv) {
  const command = argv[0];
  if (command !== 'check' && command !== 'refresh') {
    throw new UsageError(
      'usage: node tools/check-markdown-inventory.mjs <check|refresh> [--omg-path <path>]'
    );
  }

  let omgPath;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--omg-path') throw new UsageError(`unknown argument ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError('--omg-path requires a value');
    }
    if (omgPath !== undefined) throw new UsageError('--omg-path may be supplied only once');
    omgPath = value;
    index += 1;
  }
  return { command, omgPath };
}

function readInventory(inventoryPath) {
  try {
    const text = readFileSync(inventoryPath, 'utf8');
    return { rows: parseInventory(text), text };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { rows: [], text: undefined };
    }
    throw error;
  }
}

function writeInventory(inventoryPath, text) {
  mkdirSync(dirname(inventoryPath), { recursive: true });
  const temporaryPath = `${inventoryPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, text);
    renameSync(temporaryPath, inventoryPath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (!(
        cleanupError instanceof Error &&
        'code' in cleanupError &&
        cleanupError.code === 'ENOENT'
      )) {
        throw cleanupError;
      }
    }
    throw error;
  }
}

function reportFailures(failures) {
  for (const failure of failures) console.error(`[markdown-inventory] ${failure}`);
}

function runCli(argv) {
  const { command, omgPath } = parseArgs(argv);
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const inventoryPath = join(repoRoot, 'docs', 'operations', 'markdown-inventory.tsv');
  const tracked = new Map([['omg-web', listTrackedMarkdown(repoRoot)]]);
  if (omgPath !== undefined) tracked.set('omg', listTrackedMarkdown(omgPath));

  const current = readInventory(inventoryPath);
  if (command === 'refresh') {
    const merged = mergeInventory(current.rows, tracked);
    const text = serializeInventory(merged.rows);
    if (text !== current.text) writeInventory(inventoryPath, text);
    const failures = validateInventory(merged.rows, tracked, { final: false });
    reportFailures(failures);
    console.log(`[markdown-inventory] added ${merged.added.length} row(s)`);
    return failures.length === 0 ? 0 : 1;
  }

  const failures = validateInventory(current.rows, tracked, { final: true });
  reportFailures(failures);
  const verifiedRepositories = [...tracked.keys()].join(', ');
  const suffix = omgPath === undefined ? '; omg was not verified' : '';
  console.log(`[markdown-inventory] verified repositories: ${verifiedRepositories}${suffix}`);
  return failures.length === 0 ? 0 : 1;
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[markdown-inventory] ${message}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
