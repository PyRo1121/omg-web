import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const workerRoot = new URL('../', import.meta.url);
const manifestUrl = new URL('migrations.sha256', workerRoot);

function fail(message) {
  process.stderr.write(`[migrations] ${message}\n`);
  process.exitCode = 1;
}

function parseManifest(contents) {
  const entries = new Map();
  for (const line of contents.trim().split('\n')) {
    const separator = line.indexOf('  ');
    if (separator < 0) {
      fail(`invalid manifest line: ${line}`);
      continue;
    }
    entries.set(line.slice(separator + 2), line.slice(0, separator));
  }
  return entries;
}

async function sqlFiles(directory) {
  return (await readdir(new URL(`${directory}/`, workerRoot)))
    .filter(name => name.endsWith('.sql'))
    .map(name => `${directory}/${name}`)
    .toSorted();
}

const manifest = parseManifest(await readFile(manifestUrl, 'utf8'));
const discovered = [...(await sqlFiles('migrations')), ...(await sqlFiles('migrations-legacy'))];

for (const path of discovered) {
  const expected = manifest.get(path);
  if (expected === undefined) {
    fail(`unregistered SQL file: ${path}`);
    continue;
  }
  const bytes = await readFile(new URL(path, workerRoot));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    fail(`immutable migration changed: ${path}`);
  }
}

for (const path of manifest.keys()) {
  if (!discovered.includes(path)) {
    fail(`manifest references missing SQL file: ${path}`);
  }
}

const rootSql = (await readdir(fileURLToPath(workerRoot))).filter(name => name.endsWith('.sql'));
if (rootSql.length > 0) {
  fail(`competing root schema files found: ${rootSql.join(', ')}`);
}

if (process.exitCode === undefined) {
  process.stdout.write(`[migrations] verified ${discovered.length} immutable SQL files\n`);
}
