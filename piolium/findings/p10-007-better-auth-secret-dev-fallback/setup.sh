#!/usr/bin/env bash
# Provision a real workerd environment for p10-007.
#
# Builds and runs the actual production omg-site SolidStart Worker via
# `wrangler dev` against local D1 (Better Auth tables applied), deliberately
# WITHOUT setting the BETTER_AUTH_SECRET binding — the exact misconfiguration
# the finding describes (site/wrangler.toml declares no vars/secrets, so
# nothing in-repo enforces the binding's presence).
#
# BETTER_AUTH_URL is set to the local origin because a real deployment that
# lost only its secret binding would still have its URL binding; this lets
# /api/auth/* function (via better-auth's own hardcoded fallback constant)
# so session rows exist for the forgery step.
set -euo pipefail
SITE_DIR="$(cd "$(dirname "$0")/../../.." && pwd)/site"
STATE_DIR=/tmp/p10-007-state
PORT=8807

echo "[*] Applying Better Auth D1 migrations (auth_user/auth_session/...)..."
(cd "$SITE_DIR/workers" && npx wrangler d1 migrations apply omg-platform --local --persist-to "$STATE_DIR") >/dev/null

echo "[*] Building omg-site production Worker (vinxi build)..."
(cd "$SITE_DIR" && npm run build:site) > /tmp/p10-007-build.log 2>&1 || { tail -5 /tmp/p10-007-build.log; exit 1; }

echo "[*] Starting wrangler dev on port $PORT with NO BETTER_AUTH_SECRET binding..."
pkill -f "wrangler.*--port $PORT" 2>/dev/null || true
rm -f /tmp/p10-007-wrangler.log
(cd "$SITE_DIR" && nohup npx wrangler dev --config wrangler.toml --port "$PORT" \
  --persist-to "$STATE_DIR" \
  --var "BETTER_AUTH_URL:http://127.0.0.1:$PORT" \
  > /tmp/p10-007-wrangler.log 2>&1 &)

for i in $(seq 1 45); do
  curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/" && break
  sleep 1
done

echo "[*] Healthcheck:"
echo -n "    GET / -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:$PORT/"
echo -n "    GET /dashboard (no cookie) -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:$PORT/dashboard"
sleep 2
grep -c "low-entropy" /tmp/p10-007-wrangler.log | xargs echo "    better-auth low-entropy-secret warnings emitted (from 'dev-secret-change-me'):" || true
