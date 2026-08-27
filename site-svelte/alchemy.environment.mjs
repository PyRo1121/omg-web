import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REQUIRED_ENVIRONMENT = [
  'CLOUDFLARE_ACCOUNT_ID',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'SVELTE_BFF_SECRET',
];
const KEYRING_SERVICE = 'omg-web-alchemy';
const ALCHEMY_BINARY = fileURLToPath(new URL('node_modules/.bin/alchemy', import.meta.url));

function keyringValue(name) {
  const result = spawnSync('secret-tool', ['lookup', 'service', KEYRING_SERVICE, 'key', name], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024,
  });
  if (result.status !== 0 || result.stdout.length === 0) {
    return null;
  }
  return result.stdout.replace(/\r?\n$/u, '');
}

const environment = { ...process.env };
for (const name of REQUIRED_ENVIRONMENT) {
  if (environment[name] !== undefined && environment[name] !== '') {
    continue;
  }
  const value = keyringValue(name);
  if (value === null) {
    process.stderr.write(
      `[alchemy-env] ${name} must be injected by the environment or the desktop keyring\n`
    );
    process.exit(1);
  }
  environment[name] = value;
}

const result = spawnSync(ALCHEMY_BINARY, process.argv.slice(2), {
  env: environment,
  stdio: 'inherit',
});
if (result.error !== undefined) {
  process.stderr.write('[alchemy-env] failed to start the local Alchemy CLI\n');
  process.exit(1);
}
process.exit(result.status ?? 1);
