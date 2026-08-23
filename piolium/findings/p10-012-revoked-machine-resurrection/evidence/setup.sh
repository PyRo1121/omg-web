#!/usr/bin/env bash
# Environment = @cloudflare/vitest pool (workerd) + local miniflare D1 with
# site/workers/migrations applied. Provisioned implicitly by `npx vitest run`
# inside site/workers; no external services required.
set -euo pipefail
cd "$(dirname "$0")"/../../../site/workers
npx vitest run tests/validate-license-contract.test.ts
