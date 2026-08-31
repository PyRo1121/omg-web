import { readFile } from 'node:fs/promises';

const LOCKFILES = [
  'package-lock.json',
  'site/package-lock.json',
  'site-svelte/package-lock.json',
  'workers/api/package-lock.json',
  'workers/releases/package-lock.json',
  'workers/router/package-lock.json',
];

const failures = [];
for (const path of LOCKFILES) {
  const document = JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
  const manifestPath = path.replace('package-lock.json', 'package.json');
  const manifest = JSON.parse(
    await readFile(new URL(`../${manifestPath}`, import.meta.url), 'utf8')
  );
  const scriptPolicy = manifest.allowScripts ?? {};
  for (const [packagePath, entry] of Object.entries(document.packages ?? {})) {
    if (packagePath.length === 0 || entry.link === true || entry.inBundle === true) continue;
    if (entry.resolved === undefined || entry.integrity === undefined) {
      failures.push(`${path}: ${packagePath} lacks resolved registry integrity`);
      continue;
    }
    if (!entry.resolved.startsWith('https://registry.npmjs.org/')) {
      failures.push(`${path}: ${packagePath} resolves outside registry.npmjs.org`);
    }
    if (entry.hasInstallScript === true) {
      const marker = 'node_modules/';
      const packageName = packagePath.slice(packagePath.lastIndexOf(marker) + marker.length);
      const policyKey = `${packageName}@${entry.version}`;
      if (!Object.hasOwn(scriptPolicy, policyKey)) {
        failures.push(`${manifestPath}: ${policyKey} lacks an explicit install-script decision`);
      }
    }
  }
  for (const policyKey of Object.keys(scriptPolicy)) {
    if (!policyKey.includes('@')) {
      failures.push(`${manifestPath}: ${policyKey} is not version-qualified`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`[lockfiles] verified ${LOCKFILES.length} integrity-pinned lockfiles\n`);
}
