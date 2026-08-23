#!/usr/bin/env bash
# Provision a real workerd environment for p10-015 (/api/install-ping unthrottled).
# Runs the actual production SaaS Worker via `wrangler dev` with local D1 migrations
# applied. No special posture needed: the vulnerability is the absence of a rate
# limiter / length caps on an intentionally anonymous route in the shipped handler.
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)/../../../../site/workers"

echo "[*] Applying D1 migrations to local database..."
npx wrangler d1 migrations apply omg-platform --local

echo "[*] Starting wrangler dev (workerd) on port 8915..."
pkill -f "wrangler.*8915" 2>/dev/null || true
rm -f /tmp/wrangler-dev-p10-015.log
nohup npx wrangler dev --port 8915 \
  --var "JWT_SECRET:poc-test-secret-0123456789abcdef" \
  > /tmp/wrangler-dev-p10-015.log 2>&1 &

for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://127.0.0.1:8915/health; then break; fi
  sleep 1
done

echo "[*] Healthcheck: GET /health must return ok..."
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8915/health
echo "[*] Healthcheck: baseline installs badge..."
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8915/api/badge/installs
echo "[*] Healthcheck: single install-ping accepted..."
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8915/api/install-ping \
  -X POST -H 'content-type: application/json' \
  -d '{"install_id":"healthcheck-probe-0001"}'
