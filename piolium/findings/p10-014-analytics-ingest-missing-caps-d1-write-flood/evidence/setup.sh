#!/usr/bin/env bash
# Provision a real workerd environment for p10-014 (/api/analytics missing caps).
# Runs the actual production Worker via `wrangler dev` with local D1 migrations applied.
# No special posture needed: the vulnerability is the absence of caps/limiter in the
# shipped handler, not a configuration default.
set -euo pipefail
cd "$(dirname "$0")/../../../site/workers"

echo "[*] Applying D1 migrations to local database..."
npx wrangler d1 migrations apply omg-platform --local

echo "[*] Starting wrangler dev (workerd) on port 8814..."
pkill -f "wrangler.*8814" 2>/dev/null || true
rm -f /tmp/wrangler-dev-p10-014.log
nohup npx wrangler dev --port 8814 \
  --var "JWT_SECRET:poc-test-secret-0123456789abcdef" \
  > /tmp/wrangler-dev-p10-014.log 2>&1 &

for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://127.0.0.1:8814/health; then break; fi
  sleep 1
done

echo "[*] Healthcheck: baseline /api/analytics probe (3 events, should be accepted)..."
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8814/api/analytics \
  -X POST -H 'content-type: application/json' \
  -d '{"events":[{"event_type":"command","event_name":"healthcheck","timestamp":"2026-08-23T00:00:00Z","session_id":"hc","machine_id":"hc","version":"1","platform":"hc"}]}'
