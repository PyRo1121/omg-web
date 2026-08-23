#!/usr/bin/env bash
# Provision a real workerd environment for p10-008.
# Runs the production Worker via `wrangler dev` with local D1 migrations applied.
#
# Threat-model note: STRIPE_WEBHOOK_SECRET below is the *merchant's* webhook signing
# secret — in production only Stripe holds it and signs every delivered event. The
# attacker never needs it: they trigger a real Stripe customer.created event whose
# `email` field is attacker-chosen (entering the victim's email at checkout). The PoC
# signs events with this secret purely to play Stripe's role as the delivery channel;
# all exploit content (the email, the customer id) is attacker-shaped exactly as in
# the real attack.
set -euo pipefail
cd "$(dirname "$0")/../../../site/workers"

echo "[*] Applying D1 migrations to local database..."
npx wrangler d1 migrations apply omg-platform --local

echo "[*] Starting wrangler dev (workerd) on port 8799..."
pkill -f "wrangler.*8799" 2>/dev/null || true
rm -f /tmp/wrangler-dev-p10-008.log
nohup npx wrangler dev --port 8799 \
  --var "JWT_SECRET:poc-test-secret-0123456789abcdef" \
  --var "STRIPE_WEBHOOK_SECRET:poc-whsec-5f3e2d1c0b9a8776" \
  > /tmp/wrangler-dev-p10-008.log 2>&1 &

for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://127.0.0.1:8799/; then break; fi
  sleep 1
done

echo "[*] Seeding victim precondition: local signup, stripe_customer_id IS NULL..."
npx wrangler d1 execute omg-platform --local --command "
DELETE FROM customers WHERE email = 'victim.p10-008@legit.test';
INSERT INTO customers (id, stripe_customer_id, email, tier)
VALUES ('victim-local-row-008', NULL, 'victim.p10-008@legit.test', 'pro');
"
npx wrangler d1 execute omg-platform --local --json --command \
  "SELECT id, stripe_customer_id, email, tier FROM customers WHERE email = 'victim.p10-008@legit.test';"

echo "[*] Healthcheck: webhook without signature must fail closed (400)..."
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8799/api/stripe/webhook \
  -X POST -H 'content-type: application/json' -d '{}'
