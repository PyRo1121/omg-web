import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  listTrackedMarkdown,
  mergeInventory,
  parseInventory,
  serializeInventory,
  validateInventory,
} from './check-markdown-inventory.mjs';

const HEADER = 'repo\tpath\tscope\tdisposition\tnote\n';
const SCRIPT_PATH = fileURLToPath(new URL('./check-markdown-inventory.mjs', import.meta.url));
const SCRATCH_PARENT = join(homedir(), '.cache', 'build-targets');
mkdirSync(SCRATCH_PARENT, { recursive: true });
const SCRATCH_ROOT = mkdtempSync(join(SCRATCH_PARENT, 'omg-markdown-inventory-tests-'));
after(() => rmSync(SCRATCH_ROOT, { recursive: true, force: true }));

function createGitRepo(name, markdownFiles) {
  const repository = join(SCRATCH_ROOT, name);
  mkdirSync(repository, { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  for (const path of markdownFiles) {
    const absolutePath = join(repository, path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, `# ${path}\n`);
  }
  execFileSync('git', ['-C', repository, 'add', '--', '.']);
  return repository;
}

function installChecker(repository) {
  const destination = join(repository, 'tools', 'check-markdown-inventory.mjs');
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(SCRIPT_PATH, destination);
  return destination;
}

test('round-trips valid rows in deterministic repository and path order', () => {
  const text = `${HEADER}omg-web\tdocs/z.md\tfirst-party\treviewed\tchecked against code\nomg\tREADME.md\tfirst-party\tchanged\tclarified alpha policy\n`;

  const rows = parseInventory(text);

  assert.equal(
    serializeInventory(rows),
    `${HEADER}omg\tREADME.md\tfirst-party\tchanged\tclarified alpha policy\nomg-web\tdocs/z.md\tfirst-party\treviewed\tchecked against code\n`
  );
});

test('refresh merge preserves decisions and adds pending or excluded rows', () => {
  const existing = [
    {
      repo: 'omg',
      path: 'README.md',
      scope: 'first-party',
      disposition: 'changed',
      note: 'clarified alpha policy',
    },
  ];
  const tracked = new Map([
    ['omg', ['README.md', 'docs/new.md']],
    ['omg-web', ['piolium/report.md']],
  ]);

  const result = mergeInventory(existing, tracked);

  assert.deepEqual(result.stale, []);
  assert.equal(result.added.length, 2);
  assert.deepEqual(result.rows, [
    existing[0],
    {
      repo: 'omg',
      path: 'docs/new.md',
      scope: 'first-party',
      disposition: 'pending',
      note: '',
    },
    {
      repo: 'omg-web',
      path: 'piolium/report.md',
      scope: 'excluded',
      disposition: 'excluded',
      note: 'piolium/** is outside the documentation program',
    },
  ]);
});

test('refresh merge reports stale rows without deleting their decisions', () => {
  const staleRow = {
    repo: 'omg',
    path: 'docs/renamed.md',
    scope: 'first-party',
    disposition: 'reviewed',
    note: 'reviewed against code',
  };

  const result = mergeInventory([staleRow], new Map([['omg', []]]));

  assert.deepEqual(result.rows, [staleRow]);
  assert.deepEqual(result.stale, [staleRow]);
});

test('final validation reports every incomplete or inconsistent state', () => {
  const rows = [
    {
      repo: 'omg',
      path: 'README.md',
      scope: 'first-party',
      disposition: 'pending',
      note: '',
    },
    {
      repo: 'omg',
      path: 'README.md',
      scope: 'first-party',
      disposition: 'reviewed',
      note: 'duplicate',
    },
    {
      repo: 'omg',
      path: '../escape.md',
      scope: 'excluded',
      disposition: 'reviewed',
      note: '',
    },
    {
      repo: 'unknown',
      path: 'old.md',
      scope: 'first-party',
      disposition: 'changed',
      note: 'not a known repository',
    },
  ];
  const tracked = new Map([['omg', ['README.md', 'docs/missing.md']]]);

  const failures = validateInventory(rows, tracked, { final: true }).join('\n');

  assert.match(failures, /duplicate inventory row for omg:README\.md/u);
  assert.match(failures, /pending review for omg:README\.md/u);
  assert.match(failures, /invalid path for omg:\.\.\/escape\.md/u);
  assert.match(failures, /excluded scope and disposition must appear together/u);
  assert.match(failures, /evidence note is required/u);
  assert.match(failures, /unknown repository "unknown"/u);
  assert.match(failures, /missing inventory row for omg:docs\/missing\.md/u);
  assert.match(failures, /stale inventory row for omg:\.\.\/escape\.md/u);
});

test('validation ignores staleness for a repository that was not enumerated', () => {
  const rows = [
    {
      repo: 'omg',
      path: 'README.md',
      scope: 'first-party',
      disposition: 'reviewed',
      note: 'reviewed against code',
    },
  ];

  assert.deepEqual(validateInventory(rows, new Map([['omg-web', []]]), { final: true }), []);
});

test('lists exact tracked Markdown paths through the Git boundary', () => {
  const repository = createGitRepo('git-boundary', ['README.md', 'docs/café.md']);
  writeFileSync(join(repository, 'docs', 'untracked.md'), '# untracked\n');

  assert.deepEqual(listTrackedMarkdown(repository), ['README.md', 'docs/café.md']);
});

test('CLI refresh is idempotent and check rejects then accepts a reviewed inventory', () => {
  const repository = createGitRepo('cli', ['README.md', 'piolium/report.md']);
  const checker = installChecker(repository);

  const firstRefresh = spawnSync(process.execPath, [checker, 'refresh'], {
    encoding: 'utf8',
  });
  assert.equal(firstRefresh.status, 0, firstRefresh.stderr);
  const inventoryPath = join(repository, 'docs', 'operations', 'markdown-inventory.tsv');
  const firstInventory = readFileSync(inventoryPath, 'utf8');
  assert.match(firstInventory, /omg-web\tREADME\.md\tfirst-party\tpending\t/u);
  assert.match(firstInventory, /omg-web\tpiolium\/report\.md\texcluded\texcluded\t/u);

  const secondRefresh = spawnSync(process.execPath, [checker, 'refresh'], {
    encoding: 'utf8',
  });
  assert.equal(secondRefresh.status, 0, secondRefresh.stderr);
  assert.equal(readFileSync(inventoryPath, 'utf8'), firstInventory);

  const pendingCheck = spawnSync(process.execPath, [checker, 'check'], { encoding: 'utf8' });
  assert.equal(pendingCheck.status, 1);
  assert.match(pendingCheck.stderr, /pending review for omg-web:README\.md/u);

  writeFileSync(
    inventoryPath,
    firstInventory.replace(
      'omg-web\tREADME.md\tfirst-party\tpending\t',
      'omg-web\tREADME.md\tfirst-party\treviewed\tchecked against code'
    )
  );
  const reviewedCheck = spawnSync(process.execPath, [checker, 'check'], { encoding: 'utf8' });
  assert.equal(reviewedCheck.status, 0, reviewedCheck.stderr);
  assert.match(reviewedCheck.stdout, /verified repositories: omg-web/u);
});

test('relocating an equivalent repository produces byte-identical inventory output', () => {
  const firstRepository = createGitRepo('relocation-a', ['README.md', 'docs/guide.md']);
  const secondRepository = createGitRepo('relocation-b', ['README.md', 'docs/guide.md']);
  const firstChecker = installChecker(firstRepository);
  const secondChecker = installChecker(secondRepository);

  assert.equal(spawnSync(process.execPath, [firstChecker, 'refresh']).status, 0);
  assert.equal(spawnSync(process.execPath, [secondChecker, 'refresh']).status, 0);
  assert.equal(
    readFileSync(join(firstRepository, 'docs', 'operations', 'markdown-inventory.tsv'), 'utf8'),
    readFileSync(join(secondRepository, 'docs', 'operations', 'markdown-inventory.tsv'), 'utf8')
  );
});
