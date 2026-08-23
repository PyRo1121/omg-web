#!/usr/bin/env bash
# Provision a real workerd environment for p10-002 (no IP rate limiter on auth surface).
# Runs the actual production Worker via `wrangler dev` with local D1 migrations applied.
# Default posture: TURNSTILE_SECRET_KEY unset, AUTH_RATE_LIMITER declared but never wired.
set -euo pipefail
cd "$(dirname "$0")/../../../site/workers"

echo "[*] Applying D1 migrations to local database..."
npx wrangler d1 migrations apply omg-platform --local

echo "[*] Starting wrangler dev (workerd) on port 8799..."
pkill -f "wrangler.*8799" 2>/dev/null || true
rm -f /tmp/wrangler-dev-p10-002.log
nohup npx wrangler dev --port 8799 \
  --var "JWT_SECRET:poc-test-secret-0123456789abcdef" \
  > /tmp/wrangler-dev-p10-002.log 2>&1 &

for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://127.0.0.1:8799/; then break; fi
  sleep 1
done

echo "[*] Healthcheck: POST /api/auth/send-code probe..."
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8799/api/auth/send-code \
  -X POST -H 'content-type: application/json' \
  -d '{"email":"probe@anywhere.test"}'
