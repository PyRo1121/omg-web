#!/usr/bin/env bash
# p10-001 exploit runner — executes poc.test.ts against the real worker
# (workerd via @cloudflare/vitest pool, production D1 migrations).
# Emits the structured result JSON as the LAST stdout line.
set -u
cd "$(dirname "$0")"
REPO="$(cd ../../.. && pwd)"        # piolium/findings/<dir> -> repo root
WORKERS="$REPO/site/workers"
TESTFILE="tests/adversarial-p10-001.test.ts"
RUNLOG="$(mktemp)"

cp poc.test.ts "$WORKERS/$TESTFILE"
cd "$WORKERS"
npx vitest run "$TESTFILE" --disable-console-intercept >"$RUNLOG" 2>&1
RC=$?
rm -f "$TESTFILE"
cat "$RUNLOG"

if [ "$RC" -ne 0 ]; then
  echo '{"status": "failed", "evidence": "vitest run failed - see exploit.log", "notes": ""}'
  exit 0
fi

if grep -q "A_otp_row_issued=true" "$RUNLOG" \
   && grep -q "B_status=200" "$RUNLOG" \
   && grep -q "C_control_status=400" "$RUNLOG" \
   && grep -q "D_delivered=5/5" "$RUNLOG"; then
  echo '{"status": "confirmed", "evidence": "send-code returned 200 + issued OTP row with NO turnstileToken while TURNSTILE_SECRET_KEY unset; identical request rejected 400 once secret is configured", "notes": "real workerd stack, production D1 migrations"}'
else
  echo '{"status": "inconclusive", "evidence": "markers incomplete - see exploit.log", "notes": ""}'
fi
