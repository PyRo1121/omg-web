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
    label: 'Worker omg-site',
    arguments: ['deployments', 'list', '--name', 'omg-site', '--json'],
  },
  {
    label: 'D1 omg-platform (fee8ddab-fb4a-4be4-b8d2-8abb7c2db188)',
    arguments: ['d1', 'info', 'fee8ddab-fb4a-4be4-b8d2-8abb7c2db188', '--json'],
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
