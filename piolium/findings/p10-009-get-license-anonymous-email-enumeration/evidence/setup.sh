#!/usr/bin/env bash
# Provision a real workerd environment for p10-009.
# Runs the actual production SaaS Worker via `wrangler dev` with local D1 migrations,
# then seeds three customer/license rows (two victims with different tiers, one control).
# The victim rows are ordinary production-shaped data inserted through the real schema —
# the exploit itself uses only the public GET /api/get-license route.
set -euo pipefail
cd "$(dirname "$0")/../../../site/workers"

echo "[*] Applying D1 migrations to local database..."
npx wrangler d1 migrations apply omg-platform --local

echo "[*] Seeding victim customers + licenses + machines..."
npx wrangler d1 execute omg-platform --local --command "
INSERT OR REPLACE INTO customers (id, email, company, tier) VALUES
  ('poc-cust-pro',  'victim.pro@example.test',  'VictimCorp',  'pro'),
  ('poc-cust-team', 'victim.team@example.test', 'VictimCorp',  'team');
INSERT OR REPLACE INTO licenses (id, customer_id, license_key, tier, status, max_machines, expires_at) VALUES
  ('poc-lic-pro',  'poc-cust-pro',  'lic_poc_pro_key_0001',  'pro',  'active',   5, '2027-01-01'),
  ('poc-lic-team', 'poc-cust-team', 'lic_poc_team_key_0001', 'team', 'canceled', 20, '2026-01-01');
INSERT OR REPLACE INTO machines (id, license_id, machine_id, hostname, is_active) VALUES
  ('poc-m1', 'poc-lic-pro', 'mach-aaa', 'ws-1', 1),
  ('poc-m2', 'poc-lic-pro', 'mach-bbb', 'ws-2', 1),
  ('poc-m3', 'poc-lic-pro', 'mach-ccc', 'ws-3', 1),
  ('poc-m4', 'poc-lic-team', 'mach-ddd', 'ws-9', 0);
"

echo "[*] Starting wrangler dev (workerd) on port 8797..."
pkill -f "wrangler.*8797" 2>/dev/null || true
rm -f /tmp/wrangler-dev-p10-009.log
nohup npx wrangler dev --port 8797 \
  --var "JWT_SECRET:poc-test-secret-0123456789abcdef" \
  --var "ADMIN_API_SECRET:poc-admin-secret-3f9a1c" \
  > /tmp/wrangler-dev-p10-009.log 2>&1 &

for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://127.0.0.1:8797/health; then break; fi
  sleep 1
done

echo "[*] Healthcheck: GET /health must return ok..."
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8797/health
echo "[*] Healthcheck: GET /api/get-license with no email must 400 (route alive)..."
curl -s -w "\nHTTP %{http_code}\n" "http://127.0.0.1:8797/api/get-license"
