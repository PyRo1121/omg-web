import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { LicensingRoutes } from '../shared/licensing-routes.ts';

const workspaceRoot = new URL('../', import.meta.url);
const requireFromSite = createRequire(new URL('../site/package.json', import.meta.url));
const ts = requireFromSite('typescript');

const runtimeSourceDirectories = ['shared', 'site/src', 'workers/api/src'];
const consumerSourceDirectories = [
  ...runtimeSourceDirectories,
  'site/e2e',
  'site/tests',
  'workers/api/tests',
];
const frameworkEntryPoints = new Set(['site/src/hooks.server.ts', 'workers/api/src/worker.ts']);
const sourceExtensions = ['.js', '.mjs', '.svelte', '.ts'];
const sourceExtensionSet = new Set(sourceExtensions);
const requiredSiteFiles = [
  'site/alchemy.environment.mjs',
  'site/alchemy.run.ts',
  'site/package-lock.json',
  'site/package.json',
  'site/src/hooks.server.ts',
  'site/vite.config.ts',
];
const removedRuntimeFiles = [
  'site/app.config.ts',
  'site/postcss.config.js',
  'site/vitest.config.ts',
  'site/worker-configuration.d.ts',
  'site/wrangler.toml',
];
const repositoryConfigFiles = [
  '.gitattributes',
  '.github/CODEOWNERS',
  '.github/workflows/ci.yml',
  '.gitignore',
  'CONTRIBUTING.md',
  'README.md',
  'package.json',
  'tools/check-lockfile-integrity.mjs',
  'tools/check-unused-exports.mjs',
];
const privacyRouteFiles = ['site/src/routes/privacy/+page.svelte'];
const canonicalSiteHostname = 'getomg.xyz';
const retiredSiteOrigin = 'https://omg.latham.cloud';
const canonicalPublicArtifacts = ['site/static/install.ps1', 'site/static/og/omg-og.svg'];
const forbiddenFrameworkImport = /^(?:@solidjs\/|solid-js(?:\/|$)|vinxi(?:\/|$))/u;
const forbiddenRepositoryMarker = /site-svelte|\.vinxi|solid-js|@solidjs\/|\bvinxi\b/iu;
const obsoleteWorkerEntries = new Set(['releases', 'router']);
const productionWranglerConfigs = ['workers/api/wrangler.toml'];
const secretVariableName = /(?:API_KEY|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)$/u;
const forbiddenPolicies = [
  { marker: '@effect/schema', reason: 'use Schema from the main effect package' },
  { marker: 'Effect.promise(', reason: 'use a typed Effect.tryPromise boundary' },
  { marker: 'console.', reason: 'use the typed observability boundary' },
  { marker: 'oxlint-disable', reason: 'fix the anti-slop violation instead of suppressing it' },
  { marker: 'eslint-disable', reason: 'fix the lint violation instead of suppressing it' },
  { marker: '@ts-ignore', reason: 'model and fix the type error' },
  { marker: '@ts-expect-error', reason: 'model and fix the type error' },
  { marker: 'biome-ignore', reason: 'fix the lint violation instead of suppressing it' },
];
const externalBoundarySignal =
  /\bfetch\(|\.formData\(|(?<!Response)\.json\(|JSON\.parse\(|\.first\(|\.all\(/u;
const effectImport = /from\s+['"]effect(?:\/[^'"]+)?['"]/u;
const privatePrivacyTerms = [
  'customer_id',
  'email_on_file',
  'license_id',
  'license_key',
  'machine_id',
  'stripe_customer_id',
  'user_email',
];
const runtimeSourceMap = new Map();
const violations = [];

async function allFiles(directory) {
  const entries = await readdir(new URL(`${directory}/`, workspaceRoot), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await allFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function readable(path) {
  try {
    await readFile(new URL(path, workspaceRoot));
    return true;
  } catch {
    return false;
  }
}

function report(path, message) {
  violations.push({ path, message });
}

function scriptSource(path, source) {
  if (!path.endsWith('.svelte')) return source;
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gu)]
    .map(match => match[1] ?? '')
    .join('\n');
}

function scriptKind(path) {
  if (path.endsWith('.js') || path.endsWith('.mjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function resolveImport(importer, specifier) {
  let unresolved;
  const bareSpecifier = specifier.replace(/\?.*$/u, '');
  if (bareSpecifier.startsWith('$lib/')) {
    unresolved = `site/src/lib/${bareSpecifier.slice(5)}`;
  } else if (bareSpecifier.startsWith('.')) {
    unresolved = posix.normalize(posix.join(posix.dirname(importer), bareSpecifier));
  } else {
    return null;
  }

  const base = unresolved.replace(/\.(?:js|mjs)$/u, '');
  const candidates = [
    unresolved,
    base,
    ...sourceExtensions.map(suffix => `${base}${suffix}`),
    ...sourceExtensions.map(suffix => `${base}/index${suffix}`),
  ];
  return candidates.find(candidate => knownRepositoryFiles.has(candidate)) ?? null;
}

function isRuntimeEntry(path) {
  return frameworkEntryPoints.has(path) || path.startsWith('site/src/routes/');
}

function cliServiceRoute(route) {
  return {
    method: route.method,
    path: route.path,
    authentication: route.authentication,
  };
}

const rootEntries = await readdir(workspaceRoot, { withFileTypes: true });
if (rootEntries.some(entry => entry.name === 'site-svelte')) {
  report('site-svelte', 'the retired migration root must not exist');
}

for (const path of requiredSiteFiles) {
  if (!(await readable(path))) report(path, 'required SvelteKit application file is missing');
}
for (const path of removedRuntimeFiles) {
  if (await readable(path)) report(path, 'retired Solid or Vinxi runtime file must not exist');
}

const siteSourceFiles = await allFiles('site/src');
for (const path of siteSourceFiles) {
  if (/\.(?:jsx|tsx)$/u.test(path)) {
    report(path, 'JSX and TSX are not part of the SvelteKit application surface');
  }
}

const sitePackageSource = await readFile(new URL('site/package.json', workspaceRoot), 'utf8');
const sitePackage = JSON.parse(sitePackageSource);
const siteDependencies = {
  ...sitePackage.dependencies,
  ...sitePackage.devDependencies,
  ...sitePackage.optionalDependencies,
  ...sitePackage.peerDependencies,
};
for (const dependency of Object.keys(siteDependencies)) {
  if (forbiddenFrameworkImport.test(dependency)) {
    report('site/package.json', `retired framework dependency remains: ${dependency}`);
  }
}
if (sitePackage.name !== 'omg-site') {
  report('site/package.json', 'the sole website package must be named omg-site');
}

const alchemyEnvironmentPath = 'site/alchemy.environment.mjs';
const invalidStageResult = spawnSync(
  process.execPath,
  [fileURLToPath(new URL(alchemyEnvironmentPath, workspaceRoot)), 'plan', '--stage', 'production'],
  { encoding: 'utf8' }
);
if (
  invalidStageResult.status !== 1 ||
  invalidStageResult.stderr.trim() !== '[alchemy-env] --stage must be exactly shadow or prod'
) {
  report(
    alchemyEnvironmentPath,
    'deployment stages must fail closed to exact shadow and prod names'
  );
}
const unapprovedDeployResult = spawnSync(
  process.execPath,
  [fileURLToPath(new URL(alchemyEnvironmentPath, workspaceRoot)), 'deploy', '--stage', 'shadow'],
  { encoding: 'utf8' }
);
if (
  unapprovedDeployResult.status !== 1 ||
  unapprovedDeployResult.stderr.trim() !== '[alchemy-env] non-interactive deploy requires --yes'
) {
  report(alchemyEnvironmentPath, 'non-interactive deployments must require explicit approval');
}

const serviceContractPath = 'contracts/service-api-v1.json';
const serviceContract = JSON.parse(
  await readFile(new URL(serviceContractPath, workspaceRoot), 'utf8')
);
const expectedServiceContract = {
  schemaVersion: 1,
  origin: 'https://omg-api.latham.cloud',
  cliEndpoints: {
    validateLicense: cliServiceRoute(LicensingRoutes.validateLicensePost),
    reportUsage: cliServiceRoute(LicensingRoutes.reportUsage),
    installPing: cliServiceRoute(LicensingRoutes.installPing),
    cliBatch: cliServiceRoute(LicensingRoutes.cliBatch),
    teamMembers: cliServiceRoute(LicensingRoutes.cliTeamMembers),
    teamPolicies: cliServiceRoute(LicensingRoutes.cliPolicies),
    teamAuditLog: cliServiceRoute(LicensingRoutes.cliAuditLog),
  },
};
if (!isDeepStrictEqual(serviceContract, expectedServiceContract)) {
  report(
    serviceContractPath,
    'generated CLI service contract differs from the Worker route registry'
  );
}

const antiSlopSyncPath = 'tools/oxlint/sync-anti-slop.mjs';
const antiSlopSync = await readFile(new URL(antiSlopSyncPath, workspaceRoot), 'utf8');
if (antiSlopSync.includes('tmpdir')) {
  report(
    antiSlopSyncPath,
    'network clones belong under ~/.cache/build-targets, not RAM-backed temporary storage'
  );
}

for (const entry of await readdir(new URL('workers/', workspaceRoot), { withFileTypes: true })) {
  if (obsoleteWorkerEntries.has(entry.name)) {
    report(`workers/${entry.name}`, 'obsolete undeployed Worker must not be reintroduced');
  }
}

for (const configPath of productionWranglerConfigs) {
  const config = await readFile(new URL(configPath, workspaceRoot), 'utf8');
  let inPlaintextVariables = false;
  for (const line of config.split('\n')) {
    const section = /^\s*\[([A-Za-z0-9_.-]+)\]\s*$/u.exec(line);
    if (section !== null) {
      inPlaintextVariables = section[1] === 'vars' || section[1]?.endsWith('.vars') === true;
      continue;
    }
    if (!inPlaintextVariables) continue;
    const assignment = /^\s*([A-Z][A-Z0-9_]*)\s*=/u.exec(line);
    if (assignment?.[1] !== undefined && secretVariableName.test(assignment[1])) {
      report(configPath, `${assignment[1]} must use a secret binding, not plaintext [vars]`);
    }
  }
}

for (const path of repositoryConfigFiles) {
  const source = await readFile(new URL(path, workspaceRoot), 'utf8');
  const marker = forbiddenRepositoryMarker.exec(source);
  if (marker !== null) {
    report(path, `retired website marker remains: ${marker[0]}`);
  }
}

for (const directory of runtimeSourceDirectories) {
  for (const path of await allFiles(directory)) {
    if (sourceExtensionSet.has(posix.extname(path)) && !path.endsWith('.d.ts')) {
      runtimeSourceMap.set(path, await readFile(new URL(path, workspaceRoot), 'utf8'));
    }
  }
}

const publicSiteSource = runtimeSourceMap.get('shared/public-site.ts');
if (
  publicSiteSource === undefined ||
  !publicSiteSource.includes(`SITE_HOSTNAME = '${canonicalSiteHostname}'`)
) {
  report('shared/public-site.ts', `SITE_HOSTNAME must be ${canonicalSiteHostname}`);
}

for (const [path, source] of runtimeSourceMap) {
  if (/\.(?:test|spec)\.[^.]+$/u.test(path) || path === 'shared/public-site.ts') continue;
  if (source.includes(canonicalSiteHostname)) {
    report(path, 'production modules must import the shared canonical site contract');
  }
  if (source.includes(retiredSiteOrigin)) {
    report(path, `retired site origin remains: ${retiredSiteOrigin}`);
  }
}

for (const path of canonicalPublicArtifacts) {
  const source = await readFile(new URL(path, workspaceRoot), 'utf8');
  if (!source.includes(canonicalSiteHostname)) {
    report(path, `public artifact must name ${canonicalSiteHostname}`);
  }
  if (source.includes('omg.latham.cloud')) {
    report(path, 'public artifact names the retired site hostname');
  }
}

const alchemyDeploymentSource = await readFile(
  new URL('site/alchemy.run.ts', workspaceRoot),
  'utf8'
);
for (const [name, value] of [
  ['SITE_HOSTNAME', canonicalSiteHostname],
  ['WWW_SITE_HOSTNAME', `www.${canonicalSiteHostname}`],
]) {
  if (!alchemyDeploymentSource.includes(`const ${name} = '${value}'`)) {
    report('site/alchemy.run.ts', `${name} must be ${value}`);
  }
}
if (!alchemyDeploymentSource.includes('name: SITE_HOSTNAME')) {
  report(
    'site/alchemy.run.ts',
    'production Website must use SITE_HOSTNAME as its canonical domain'
  );
}
if (!alchemyDeploymentSource.includes('redirects: [WWW_SITE_HOSTNAME]')) {
  report('site/alchemy.run.ts', 'production Website must redirect WWW_SITE_HOSTNAME');
}

const knownRepositoryFiles = new Set([
  ...(await allFiles('shared')),
  ...(await allFiles('site/src')),
  ...(await allFiles('site/e2e')),
  ...(await allFiles('site/tests')),
  'site/alchemy.run.ts',
  ...(await allFiles('workers/api/migrations')),
  ...(await allFiles('workers/api/src')),
  ...(await allFiles('workers/api/tests')),
]);
const consumerFiles = new Map(runtimeSourceMap);
const runtimeDependencies = new Map([...runtimeSourceMap.keys()].map(path => [path, new Set()]));
for (const directory of consumerSourceDirectories.filter(
  candidateDirectory => !runtimeSourceDirectories.includes(candidateDirectory)
)) {
  for (const path of await allFiles(directory)) {
    if (sourceExtensionSet.has(posix.extname(path)) && !path.endsWith('.d.ts')) {
      consumerFiles.set(path, await readFile(new URL(path, workspaceRoot), 'utf8'));
    }
  }
}

for (const [path, source] of consumerFiles) {
  const sourceFile = ts.createSourceFile(
    path,
    scriptSource(path, source),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  );

  function visit(node) {
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifier = node.moduleSpecifier.text;
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifier = node.arguments[0].text;
    }

    if (specifier !== undefined) {
      if (forbiddenFrameworkImport.test(specifier)) {
        report(path, `retired framework import remains: ${specifier}`);
      }
      if (specifier.startsWith('.') || specifier.startsWith('$lib/')) {
        const resolved = resolveImport(path, specifier);
        if (resolved === null && specifier !== './$types') {
          report(path, `local import does not resolve to a checked source file: ${specifier}`);
        } else if (
          resolved !== null &&
          runtimeSourceMap.has(path) &&
          runtimeSourceMap.has(resolved)
        ) {
          runtimeDependencies.get(path)?.add(resolved);
        }
        if (
          resolved !== null &&
          path.startsWith('site/src/') &&
          resolved.startsWith('workers/api/src/')
        ) {
          report(path, `website source imports the Worker implementation: ${resolved}`);
        } else if (
          runtimeSourceMap.has(path) &&
          resolved !== null &&
          !path.startsWith('site/') &&
          resolved.startsWith('site/src/')
        ) {
          report(path, `shared or Worker source imports the website implementation: ${resolved}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (source.includes('localStorage.getItem') && source.includes('JSON.parse(')) {
    report(path, 'localStorage values must be length-bounded before parsing');
  }
  for (const policy of forbiddenPolicies) {
    if (source.includes(policy.marker)) {
      report(path, `${policy.reason} (${policy.marker})`);
    }
  }
  if (forbiddenRepositoryMarker.test(source) && !path.endsWith('check-source-policy.mjs')) {
    report(path, 'retired website implementation marker remains');
  }
}

const reachableRuntimeFiles = new Set();
const pendingRuntimeFiles = [...runtimeSourceMap.keys()].filter(isRuntimeEntry);
while (pendingRuntimeFiles.length > 0) {
  const path = pendingRuntimeFiles.pop();
  if (path === undefined || reachableRuntimeFiles.has(path)) continue;
  reachableRuntimeFiles.add(path);
  pendingRuntimeFiles.push(...(runtimeDependencies.get(path) ?? []));
}
for (const path of runtimeSourceMap.keys()) {
  if (!/\.(?:test|spec)\.[^.]+$/u.test(path) && !reachableRuntimeFiles.has(path)) {
    report(path, 'production module is unreachable from every route or Worker entry point');
  }
}

const licensingRoutesSource = await readFile(
  new URL('shared/licensing-routes.ts', workspaceRoot),
  'utf8'
);
const workerSource = await readFile(new URL('workers/api/src/worker.ts', workspaceRoot), 'utf8');
const declaredRoutes = [
  ...licensingRoutesSource.matchAll(
    /method:\s*'(GET|POST|PUT|PATCH|DELETE)'[\s\S]{0,220}?path:\s*'([^']+)'/gu
  ),
].map(match => ({ method: match[1] ?? '', path: match[2] ?? '' }));
const workerRoutePaths = new Set(
  [...workerSource.matchAll(/case\s+'([^']+)'\s*:/gu)].map(match => match[1] ?? '')
);

if (declaredRoutes.length === 0) {
  report('shared/licensing-routes.ts', 'the private Worker route contract has no routes');
}
for (const route of declaredRoutes) {
  const runtimePath = route.path.replace(/\/:[^/]+/gu, '');
  if (!workerRoutePaths.has(runtimePath)) {
    report('workers/api/src/worker.ts', `route contract path has no Worker case: ${route.path}`);
  }
}

const requiredPrivacyMarkers = [
  'Version 2.1 / Last updated September 1, 2026',
  'Website analytics:',
  'Cookies and identifiers',
  'Global Privacy Control',
  'Service providers',
  'Access and portability:',
];
const obsoletePrivacyClaims = ['from the dashboard', 'dashboard settings', 'POST /api/privacy/'];
for (const path of privacyRouteFiles) {
  const source = await readFile(new URL(path, workspaceRoot), 'utf8');
  const normalizedSource = source.replace(/\s+/gu, ' ');
  for (const marker of requiredPrivacyMarkers) {
    if (!normalizedSource.includes(marker)) {
      report(path, `privacy policy is missing ${marker}`);
    }
  }
  for (const claim of obsoletePrivacyClaims) {
    if (normalizedSource.includes(claim)) {
      report(path, `privacy policy retains false ${claim} claim`);
    }
  }
  for (const term of privatePrivacyTerms) {
    if (source.toLowerCase().includes(term)) {
      report(path, `privacy route must not project private field name: ${term}`);
    }
  }
}

const publicFilesSource = await readFile(
  new URL('site/src/lib/server/public-files.ts', workspaceRoot),
  'utf8'
);
for (const disallowed of ['/api/', '/dashboard/', '/admin/']) {
  if (!publicFilesSource.includes(`Disallow: ${disallowed}`)) {
    report('site/src/lib/server/public-files.ts', `missing private-route exclusion: ${disallowed}`);
  }
}

for (const [path, source] of runtimeSourceMap) {
  const isWebsiteProductionModule =
    path.startsWith('site/src/') && !/\.(?:test|spec)\.[^.]+$/u.test(path);
  if (isWebsiteProductionModule && externalBoundarySignal.test(source)) {
    if (path.endsWith('.svelte')) {
      report(path, 'Svelte components must delegate external boundaries to typed modules');
    } else if (!effectImport.test(source)) {
      report(path, 'website external boundaries must model expected failures with Effect');
    }
  }
  if (source.includes('Record<string, unknown>')) {
    report(path, 'open unknown dictionaries must be replaced with a named boundary schema');
  }
  if (!isRuntimeEntry(path) && source.includes('export default')) {
    report(path, 'default exports are reserved for framework runtime entries');
  }
}

for (const violation of violations.toSorted((left, right) =>
  left.path === right.path
    ? left.message.localeCompare(right.message)
    : left.path.localeCompare(right.path)
)) {
  process.stderr.write(`[source-policy] ${violation.path}: ${violation.message}\n`);
}

if (violations.length > 0) {
  process.stderr.write(`[source-policy] ${violations.length} violation(s) found\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `[source-policy] verified ${runtimeSourceMap.size} modules and a single SvelteKit website root\n`
  );
}
