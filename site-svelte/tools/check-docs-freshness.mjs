import { spawnSync } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Schema } from 'effect';

const docsDirectory = fileURLToPath(new URL('../src/lib/docs/', import.meta.url));
const routesDirectory = fileURLToPath(new URL('../src/routes/docs/', import.meta.url));
const CONTENT_DIRECTORY = 'content';
const UPSTREAM_REPO = 'PyRo1121/omg';

const RegistryTopicSchema = Schema.Struct({
  key: Schema.String,
  slug: Schema.String,
  navLabel: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  repo: Schema.String,
  path: Schema.String,
  reviewedCommit: Schema.String,
  reviewedAt: Schema.String,
});
const decodeRegistryTopic = Schema.decodeUnknownSync(RegistryTopicSchema);
const failures = [];

function reportFailure(message) {
  failures.push(message);
  process.stderr.write(`[docs-freshness] ${message}\n`);
}

function reportSuccess(message) {
  process.stdout.write(`[docs-freshness] ${message}\n`);
}

function runGit(clonePath, args) {
  return spawnSync('git', ['-C', clonePath, ...args], { encoding: 'utf8' });
}

function readTopicRegistry() {
  return readFile(`${docsDirectory}topics.ts`, 'utf8');
}

function listContentModules() {
  return readdir(`${docsDirectory}${CONTENT_DIRECTORY}/`);
}

function extractRegistryEntries(registrySource) {
  const moduleConstants = new Map();
  for (const match of registrySource.matchAll(/const (\w+) = '([^']*)'/gu)) {
    moduleConstants.set(match[1], match[2]);
  }

  const registryMatch = /const REGISTRY = \{([\s\S]*?)\n\} as const/u.exec(registrySource);
  if (registryMatch === null) {
    reportFailure('could not find the REGISTRY object in src/lib/docs/topics.ts');
    return [];
  }

  const entries = [];
  const entryPattern = /  (\w+): \{([\s\S]*?)\n  \},/gu;
  for (const match of registrySource.slice(registryMatch.index).matchAll(entryPattern)) {
    const body = match[2];
    const value = name => {
      // Matches a literal on the same or a wrapped line, or a shorthand
      // reference to a module-level constant such as a shared reviewed commit.
      const field = new RegExp(`\\b${name}:\\s*'([^']*)'|\\b${name},`, 'u').exec(body);
      if (field === null) return undefined;
      if (field[1] !== undefined) return field[1];
      return moduleConstants.get(name);
    };
    const candidate = {
      key: match[1],
      slug: value('slug'),
      navLabel: value('navLabel'),
      title: value('title'),
      summary: value('summary'),
      repo: value('repo'),
      path: value('path'),
      reviewedCommit: value('reviewedCommit'),
      reviewedAt: value('reviewedAt'),
    };
    try {
      entries.push(decodeRegistryTopic(candidate));
    } catch (error) {
      reportFailure(`registry entry "${match[1]}" could not be decoded: ${String(error)}`);
    }
  }
  if (entries.length === 0) {
    reportFailure('no topic entries could be parsed from the REGISTRY object');
  }
  return entries;
}

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/u;
const UPSTREAM_PATH_PATTERN = /^docs\/[a-z0-9-]+\.md$/u;
const REVIEWED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function validateProvenance(topic) {
  const label = topic.slug ?? topic.key;
  if (topic.slug !== topic.key) {
    reportFailure(`registry entry "${topic.key}" declares slug ${JSON.stringify(topic.slug)}`);
  }
  for (const field of ['slug', 'navLabel', 'title', 'summary']) {
    if (topic[field].length === 0) {
      reportFailure(`registry entry "${label}" is missing a non-empty ${field}`);
    }
  }
  if (topic.repo !== UPSTREAM_REPO) {
    reportFailure(`registry entry "${label}" must pin repo "${UPSTREAM_REPO}"`);
  }
  if (!UPSTREAM_PATH_PATTERN.test(topic.path)) {
    reportFailure(
      `registry entry "${label}" has an upstream path outside docs/*.md: ${JSON.stringify(topic.path)}`
    );
  }
  if (!COMMIT_PATTERN.test(topic.reviewedCommit)) {
    reportFailure(
      `registry entry "${label}" needs a reviewedCommit of 7 to 40 hex characters: ${JSON.stringify(topic.reviewedCommit)}`
    );
  }
  if (!REVIEWED_AT_PATTERN.test(topic.reviewedAt) || Number.isNaN(Date.parse(topic.reviewedAt))) {
    reportFailure(
      `registry entry "${label}" needs an ISO reviewedAt date (YYYY-MM-DD): ${JSON.stringify(topic.reviewedAt)}`
    );
  }
}

function collectDuplicateSlugs(topics) {
  const seen = new Map();
  for (const topic of topics) {
    const previous = seen.get(topic.slug);
    if (previous !== undefined) {
      reportFailure(`duplicate registry slug "${topic.slug}" (also declared by "${previous}")`);
    } else {
      seen.set(topic.slug, topic.key);
    }
  }
  return seen;
}

async function collectContentModuleSlugs() {
  const moduleSlugs = new Map();
  const files = await listContentModules();
  for (const fileName of files) {
    if (!fileName.endsWith('.ts')) continue;
    const source = await readFile(`${docsDirectory}${CONTENT_DIRECTORY}/${fileName}`, 'utf8');
    const references = [...source.matchAll(/docsTopicMeta\('([a-z0-9-]+)'\)/gu)].map(m => m[1]);
    const unique = [...new Set(references)];
    if (unique.length !== 1) {
      reportFailure(
        `content module "${fileName}" must reference exactly one registry slug; found ${JSON.stringify(unique)}`
      );
      continue;
    }
    if (moduleSlugs.has(unique[0])) {
      reportFailure(
        `content modules "${moduleSlugs.get(unique[0])}" and "${fileName}" both reference slug "${unique[0]}"`
      );
    } else {
      moduleSlugs.set(unique[0], fileName);
    }
  }
  return moduleSlugs;
}

function crossCheckContentModules(topicSlugs, moduleSlugs) {
  for (const slug of topicSlugs.keys()) {
    if (!moduleSlugs.has(slug)) {
      reportFailure(`registry slug "${slug}" has no content module under src/lib/docs/content/`);
    }
  }
  for (const slug of moduleSlugs.keys()) {
    if (!topicSlugs.has(slug)) {
      reportFailure(`content module for "${slug}" has no registry entry in src/lib/docs/topics.ts`);
    }
  }
}

async function collectRouteSlugs() {
  const routeSlugs = new Set();
  const entries = await readdir(routesDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pagePath = `${routesDirectory}${entry.name}/+page.svelte`;
    try {
      await access(pagePath);
      routeSlugs.add(entry.name);
    } catch {
      reportFailure(`docs route directory "${entry.name}" has no +page.svelte`);
    }
  }
  return routeSlugs;
}

function crossCheckRoutes(topicSlugs, routeSlugs) {
  for (const slug of topicSlugs.keys()) {
    if (!routeSlugs.has(slug)) {
      reportFailure(`registry slug "${slug}" has no static route under src/routes/docs/`);
    }
  }
  for (const slug of routeSlugs) {
    if (!topicSlugs.has(slug)) {
      reportFailure(`docs route "${slug}" has no registry entry in src/lib/docs/topics.ts`);
    }
  }
}

function verifyAgainstClone(clonePath, revision, topics) {
  const workTreeCheck = runGit(clonePath, ['rev-parse', '--is-inside-work-tree']);
  if (workTreeCheck.status !== 0 || workTreeCheck.stdout.trim() !== 'true') {
    reportFailure(`"${clonePath}" is not a usable git clone: ${workTreeCheck.stderr.trim()}`);
    return;
  }

  const selectedRevision = revision ?? 'HEAD';
  const selectedCommit = runGit(clonePath, ['rev-parse', `${selectedRevision}^{commit}`]);
  if (selectedCommit.status !== 0) {
    reportFailure(
      `revision "${selectedRevision}" does not exist in the clone: ${selectedCommit.stderr.trim()}`
    );
    return;
  }
  const selectedCommitId = selectedCommit.stdout.trim();

  for (const topic of topics) {
    if (!COMMIT_PATTERN.test(topic.reviewedCommit) || !UPSTREAM_PATH_PATTERN.test(topic.path)) {
      continue;
    }

    const reviewedCommit = runGit(clonePath, ['rev-parse', `${topic.reviewedCommit}^{commit}`]);
    if (reviewedCommit.status !== 0) {
      reportFailure(
        `topic "${topic.slug}" pins commit ${topic.reviewedCommit}, which does not exist in the clone`
      );
      continue;
    }
    const reviewedCommitId = reviewedCommit.stdout.trim();

    const pathCheck = runGit(clonePath, ['cat-file', '-e', `${reviewedCommitId}:${topic.path}`]);
    if (pathCheck.status !== 0) {
      reportFailure(
        `topic "${topic.slug}" points to ${topic.path}, which does not exist at ${topic.reviewedCommit}`
      );
      continue;
    }

    const sourceDiff = runGit(clonePath, [
      'diff',
      '--exit-code',
      reviewedCommitId,
      selectedCommitId,
      '--',
      topic.path,
    ]);
    if (sourceDiff.status === 1) {
      reportFailure(
        `topic "${topic.slug}" needs review: ${topic.path} changed between ${topic.reviewedCommit} and ${selectedRevision} (${selectedCommitId})`
      );
      continue;
    }
    if (sourceDiff.status !== 0) {
      reportFailure(
        `topic "${topic.slug}" could not be compared: ${sourceDiff.stderr.trim() || 'git diff failed'}`
      );
      continue;
    }

    reportSuccess(`topic "${topic.slug}" matches ${topic.path} at ${selectedRevision}`);
  }
}

const args = process.argv.slice(2);
let clonePath;
let revision;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--clone' || argument === '--revision') {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      reportFailure(`${argument} requires a value`);
      continue;
    }
    if (argument === '--clone') clonePath = value;
    else revision = value;
    index += 1;
  } else {
    reportFailure(
      `unknown argument ${JSON.stringify(argument)}; use --clone <path> and --revision <ref>`
    );
  }
}
if (revision !== undefined && clonePath === undefined) {
  reportFailure('--revision requires --clone <path>');
}

const registrySource = await readTopicRegistry();
const topics = extractRegistryEntries(registrySource);
for (const topic of topics) {
  validateProvenance(topic);
}
const topicSlugs = collectDuplicateSlugs(topics);
const moduleSlugs = await collectContentModuleSlugs();
crossCheckContentModules(topicSlugs, moduleSlugs);
const routeSlugs = await collectRouteSlugs();
crossCheckRoutes(topicSlugs, routeSlugs);

if (clonePath !== undefined) {
  verifyAgainstClone(clonePath, revision, topics);
}

if (failures.length > 0) {
  process.stderr.write(`[docs-freshness] failed with ${failures.length} problem(s)\n`);
  process.exit(1);
}
reportSuccess(
  `${topics.length} registry topics validated${clonePath === undefined ? '' : ` against clone ${clonePath}${revision === undefined ? '' : ` at ${revision}`}`}`
);
