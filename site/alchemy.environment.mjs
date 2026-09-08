import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const alchemyArguments = process.argv.slice(2);
const stageFlagIndex = alchemyArguments.indexOf('--stage');
const inlineStage = alchemyArguments.find(argument => argument.startsWith('--stage='));
const stage =
  inlineStage?.slice('--stage='.length) ??
  (stageFlagIndex >= 0 ? alchemyArguments[stageFlagIndex + 1] : undefined);
const allowedStages = new Set(['shadow', 'prod']);
if (stage === undefined || !allowedStages.has(stage)) {
  process.stderr.write('[alchemy-env] --stage must be exactly shadow or prod\n');
  process.exit(1);
}
if (
  alchemyArguments[0] === 'deploy' &&
  !process.stdout.isTTY &&
  !alchemyArguments.includes('--yes')
) {
  process.stderr.write('[alchemy-env] non-interactive deploy requires --yes\n');
  process.exit(1);
}
const githubCredentialPrefix = stage === 'prod' ? 'PRODUCTION_' : '';
const REQUIRED_ENVIRONMENT = [
  { binding: 'CLOUDFLARE_ACCOUNT_ID', source: 'CLOUDFLARE_ACCOUNT_ID' },
  {
    binding: 'GITHUB_CLIENT_ID',
    source: `${githubCredentialPrefix}GITHUB_CLIENT_ID`,
  },
  {
    binding: 'GITHUB_CLIENT_SECRET',
    source: `${githubCredentialPrefix}GITHUB_CLIENT_SECRET`,
  },
  { binding: 'SVELTE_BFF_SECRET', source: 'SVELTE_BFF_SECRET' },
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
for (const input of REQUIRED_ENVIRONMENT) {
  const injectedValue = environment[input.source];
  const value =
    injectedValue !== undefined && injectedValue !== ''
      ? injectedValue
      : keyringValue(input.source);
  if (value === null) {
    process.stderr.write(
      `[alchemy-env] ${input.source} must be injected by the environment or the desktop keyring\n`
    );
    process.exit(1);
  }
  environment[input.binding] = value;
  if (input.source !== input.binding) {
    delete environment[input.source];
  }
}

const result = spawnSync(ALCHEMY_BINARY, alchemyArguments, {
  env: environment,
  stdio: 'inherit',
});
if (result.error !== undefined) {
  process.stderr.write('[alchemy-env] failed to start the local Alchemy CLI\n');
  process.exit(1);
}
process.exit(result.status ?? 1);
