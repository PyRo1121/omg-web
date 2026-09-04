import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const wranglerPath = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)
);
const PLATFORM_D1_ID = 'fee8ddab-fb4a-4be4-b8d2-8abb7c2db188';

const checks = [
  {
    label: 'Worker omg-saas',
    arguments: ['deployments', 'list', '--name', 'omg-saas', '--json'],
  },
  {
    label: 'Worker omgsveltesite-website-prod-dlaqgfttmir2ky5x',
    arguments: [
      'deployments',
      'list',
      '--name',
      'omgsveltesite-website-prod-dlaqgfttmir2ky5x',
      '--json',
    ],
  },
  {
    label: `D1 omg-platform (${PLATFORM_D1_ID})`,
    arguments: ['d1', 'info', PLATFORM_D1_ID, '--json'],
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
    encoding: 'utf8',
  });

  if (result.status === 0) {
    process.stdout.write(`[cloudflare-remote] present: ${check.label}\n`);
    continue;
  }

  failures += 1;
  const detail = [result.stderr, result.stdout]
    .filter(output => output !== null && output.trim().length > 0)
    .map(output => output.trim())
    .join(' | ');
  const reason =
    result.error instanceof Error
      ? `spawn error: ${result.error.message}`
      : detail.length > 0
        ? detail.slice(0, 500)
        : `wrangler exited ${result.status ?? 'unknown'} with no output`;
  process.stderr.write(`[cloudflare-remote] inaccessible (${reason}): ${check.label}\n`);
}

if (failures > 0) {
  process.stderr.write(
    `[cloudflare-remote] ${failures} required resources are missing or inaccessible; do not deploy\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write('[cloudflare-remote] all required production resources are accessible\n');
}
