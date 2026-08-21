import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const wranglerPath = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)
);

const checks = [
  {
    label: 'Worker omg-saas',
    arguments: ['deployments', 'list', '--name', 'omg-saas', '--json'],
  },
  {
    label: 'Worker omg-router',
    arguments: ['deployments', 'list', '--name', 'omg-router', '--json'],
  },
  {
    label: 'Worker omg-releases',
    arguments: ['deployments', 'list', '--name', 'omg-releases', '--json'],
  },
  {
    label: 'Pages project omg-site',
    arguments: ['pages', 'deployment', 'list', '--project-name', 'omg-site', '--json'],
  },
  {
    label: 'D1 omg-licensing (bcaf7781-a747-4637-92d9-94782e4fa1db)',
    arguments: ['d1', 'info', 'bcaf7781-a747-4637-92d9-94782e4fa1db', '--json'],
  },
  {
    label: 'D1 omg-auth-db (871b70ca-79f7-4bb0-bfba-0f9f9aca4de9)',
    arguments: ['d1', 'info', '871b70ca-79f7-4bb0-bfba-0f9f9aca4de9', '--json'],
  },
  {
    label: 'D1 omg-analytics (e11296b5-1c01-437a-9d22-2e3786c20932)',
    arguments: ['d1', 'info', 'e11296b5-1c01-437a-9d22-2e3786c20932', '--json'],
  },
  {
    label: 'R2 omg-assets',
    arguments: ['r2', 'bucket', 'info', 'omg-assets', '--json'],
  },
  {
    label: 'R2 omg-releases',
    arguments: ['r2', 'bucket', 'info', 'omg-releases', '--json'],
  },
  {
    label: 'R2 omg-releases-preview',
    arguments: ['r2', 'bucket', 'info', 'omg-releases-preview', '--json'],
  },
];

let failures = 0;
for (const check of checks) {
  const result = spawnSync(process.execPath, [wranglerPath, ...check.arguments], {
    env: {
      ...process.env,
      NO_COLOR: '1',
      WRANGLER_SEND_METRICS: 'false',
    },
    stdio: 'ignore',
  });

  if (result.status === 0) {
    process.stdout.write(`[cloudflare-remote] present: ${check.label}\n`);
    continue;
  }

  failures += 1;
  process.stderr.write(`[cloudflare-remote] missing or inaccessible: ${check.label}\n`);
}

if (failures > 0) {
  process.stderr.write(
    `[cloudflare-remote] ${failures} required resources are missing or inaccessible; do not deploy\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write('[cloudflare-remote] all required production resources are accessible\n');
}
