import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';

const findingsRoot = resolve('piolium/findings');
const closureLedgerPath = resolve('docs/operations/audit-remediation-status.md');
const EXPECTED_FINDING_COUNTS = new Map([
  ['W2', 11],
  ['W4', 8],
  ['W5', 5],
  ['W6', 10],
  ['W7', 5],
  ['W8', 5],
  ['W9', 11],
  ['W10', 9],
  ['W12', 13],
  ['Y1', 8],
  ['Y2', 8],
  ['Y3', 12],
  ['Y4', 8],
  ['Y5', 7],
  ['Y6', 9],
]);
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

const closureLedger = await readFile(closureLedgerPath, 'utf8');
const findingRows = [
  ...closureLedger.matchAll(
    /^\|\s*(?<id>[WY]\d+-[^ |]+)\s*\|[^|]+\|\s*(?<disposition>Fixed|Accepted|Dismissed|Coordinated)\s*\|/gmu
  ),
];
const findingIds = new Set();
const actualFindingCounts = new Map();
for (const row of findingRows) {
  const id = row.groups?.id;
  const disposition = row.groups?.disposition;
  if (id === undefined || disposition === undefined) {
    fail('closure ledger contains an unparseable finding row');
    continue;
  }
  if (findingIds.has(id)) {
    fail(`duplicate closure row: ${id}`);
  }
  findingIds.add(id);
  const report = id.split('-')[0];
  actualFindingCounts.set(report, (actualFindingCounts.get(report) ?? 0) + 1);
  if (disposition === 'Coordinated' && report !== 'Y6') {
    fail(`unexpected coordinated disposition outside Y6: ${id}`);
  }
}
for (const [report, expectedCount] of EXPECTED_FINDING_COUNTS) {
  const actualCount = actualFindingCounts.get(report) ?? 0;
  if (actualCount !== expectedCount) {
    fail(`closure count for ${report}: expected ${expectedCount}, received ${actualCount}`);
  }
}
if (/^\|[^\n]+\|\s*\*\*Open\*\*\s*\|/mu.test(closureLedger)) {
  fail('report ledger still contains an open web finding');
}

if (process.exitCode === undefined) {
  process.stdout.write(
    `[audit-evidence] verified ${manifestCount} manifests, ${scriptHashes.size} unique scripts, and ${findingIds.size} closure rows\n`
  );
}
