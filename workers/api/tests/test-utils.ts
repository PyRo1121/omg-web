import '../src/cloudflare-test.d.ts';
import type { Env } from '../src/api';

type TestDatabase = Env['DB'];

/** Test data helpers for the migrated licensing schema. */

export interface TestCustomer {
  customerId: string;
  licenseId: string;
  licenseKey: string;
  email: string;
}

export async function createTestCustomer(
  db: TestDatabase,
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

export async function deleteTestCustomer(db: TestDatabase, customerId: string) {
  // Foreign key constraints will cascade delete licenses and related data
  await db.prepare('DELETE FROM customers WHERE id = ?').bind(customerId).run();
}
