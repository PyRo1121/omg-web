/** Test data helpers for the migrated licensing schema. */

export interface TestCustomer {
  customerId: string;
  licenseId: string;
  licenseKey: string;
  email: string;
}

export async function createTestCustomer(
  db: D1Database,
  email: string = 'test@example.com',
  tier: string = 'pro'
): Promise<TestCustomer> {
  const customerId = `test-customer-${crypto.randomUUID()}`;
  const licenseId = `test-license-${crypto.randomUUID()}`;
  const licenseKey = `test-key-${crypto.randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO customers (id, email, company, tier, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .bind(customerId, email, 'Test Corp', tier)
    .run();

  await db
    .prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(licenseId, customerId, licenseKey, tier, 'active', 3)
    .run();

  return { customerId, licenseId, licenseKey, email };
}

export async function deleteTestCustomer(db: D1Database, customerId: string) {
  // Foreign key constraints will cascade delete licenses and related data
  await db.prepare('DELETE FROM customers WHERE id = ?').bind(customerId).run();
}

export async function createTelemetryData(
  db: D1Database,
  licenseId: string,
  machineId: string = 'test-machine-123'
) {
  // Create command event
  await db
    .prepare(
      `INSERT INTO command_event (id, license_id, machine_id, command, success, duration_ms, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind('cmd-test-1', licenseId, machineId, 'search', 1, 45)
    .run();

  // Create session
  await db
    .prepare(
      `INSERT INTO session (id, license_id, machine_id, session_id, event_type, timestamp)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind('sess-test-1', licenseId, machineId, 'sess-123', 'start')
    .run();

  // Create performance metric
  await db
    .prepare(
      `INSERT INTO performance_metric (id, license_id, machine_id, metric_type, duration_ms, timestamp)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind('perf-test-1', licenseId, machineId, 'search_latency', 10)
    .run();

  // Create feature usage
  await db
    .prepare(
      `INSERT INTO feature_usage (id, license_id, machine_id, feature, enabled, timestamp)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind('feat-test-1', licenseId, machineId, 'sbom', 1)
    .run();
}
