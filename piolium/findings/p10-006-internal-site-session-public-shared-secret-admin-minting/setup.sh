#!/usr/bin/env bash
# Provision a real workerd environment for p10-006.
# Runs the actual production Worker via `wrangler dev` with local D1 migrations applied.
# /api/internal/site-session is registered in the same public route table as every
# customer-facing route (worker.ts:255) — no transport/binding enforcement exists, so a
# plain HTTP request to the public-style origin reaches the internal handler directly.
set -euo pipefail
cd "$(dirname "$0")/../../../site/workers"

echo "[*] Applying D1 migrations to local database..."
npx wrangler d1 migrations apply omg-platform --local

echo "[*] Starting wrangler dev (workerd) on port 8799 with ADMIN_API_SECRET set..."
pkill -f "wrangler.*8799" 2>/dev/null || true
rm -f /tmp/wrangler-dev-p10-006.log
nohup npx wrangler dev --port 8799 \
  --var "JWT_SECRET:poc-test-secret-0123456789abcdef" \
  --var "ADMIN_API_SECRET:poc-admin-secret-3f9a1c" \
  > /tmp/wrangler-dev-p10-006.log 2>&1 &

for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://127.0.0.1:8799/; then break; fi
  sleep 1
done

echo "[*] Healthcheck: /api/internal/site-session without secret must fail closed (401)..."
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8799/api/internal/site-session \
  -X POST -H 'content-type: application/json' \
  -d '{"email":"probe@anywhere.test","role":"user"}'
