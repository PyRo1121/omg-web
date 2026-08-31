import * as Schema from 'effect/Schema';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const TableInfoRowsSchema = Schema.Array(
  Schema.Struct({
    name: Schema.String,
  })
);

const MigrationRowsSchema = Schema.Array(
  Schema.Struct({
    name: Schema.String,
  })
);

const MemberIdentityRowsSchema = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    userId: Schema.String,
  })
);
const MemberRoleRowsSchema = Schema.Array(
  Schema.Struct({
    role: Schema.String,
    userId: Schema.String,
  })
);

async function tableColumns(table: string): Promise<ReadonlyArray<string>> {
  const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  return Schema.decodeUnknownSync(TableInfoRowsSchema)(result.results).map(row => row.name);
}

describe('canonical D1 migrations', () => {
  it('applies the baseline and every ordered incremental migration', async () => {
    const result = await env.DB.prepare(
      'SELECT name FROM d1_migrations ORDER BY applied_at, id'
    ).all();
    const migrations = Schema.decodeUnknownSync(MigrationRowsSchema)(result.results).map(
      row => row.name
    );

    expect(migrations).toEqual([
      '0000_current_baseline.sql',
      '011_stripe_event_inbox.sql',
      '012_secure_otp.sql',
      '013_better_auth.sql',
      '014_better_auth_issuer.sql',
      '015_customers_email_unique.sql',
      '016_customers_email_unique_enforced.sql',
      '017_subscription_status_rank.sql',
      '018_stripe_event_claim_tokens.sql',
      '019_license_usage_dimensions.sql',
      '020_marketing_offer_leads.sql',
      '021_stripe_event_dead_letter.sql',
      '022_licenses_customer_unique.sql',
      '023_session_token_hashes.sql',
      '024_better_auth_organizations.sql',
      '025_organization_owner_integrity.sql',
    ]);
  });

  it('enforces one license per customer', async () => {
    const customerId = `migration-license-customer-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'free')`)
      .bind(customerId, `${customerId}@example.com`)
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status)
       VALUES (?, ?, ?, 'free', 'active')`
    )
      .bind(crypto.randomUUID(), customerId, crypto.randomUUID())
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO licenses (id, customer_id, license_key, tier, status)
         VALUES (?, ?, ?, 'free', 'active')`
      )
        .bind(crypto.randomUUID(), customerId, crypto.randomUUID())
        .run()
    ).rejects.toThrow();

    await env.DB.prepare(`DELETE FROM licenses WHERE customer_id = ?`).bind(customerId).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id = ?`).bind(customerId).run();
  });

  it('creates the current authentication and Stripe inbox columns', async () => {
    expect(await tableColumns('auth_codes')).toEqual(
      expect.arrayContaining(['code', 'used', 'attempt_count'])
    );
    expect(await tableColumns('stripe_events')).toEqual(
      expect.arrayContaining(['status', 'attempt_count', 'processing_started_at', 'last_error'])
    );
    expect(await tableColumns('auth_user')).toEqual(
      expect.arrayContaining(['id', 'email', 'email_verified', 'role'])
    );
    expect(await tableColumns('sessions')).toEqual(
      expect.arrayContaining(['id', 'token', 'token_hash', 'expires_at', 'customer_id'])
    );
    expect(await tableColumns('auth_session')).toEqual(
      expect.arrayContaining(['id', 'token', 'expires_at', 'user_id', 'active_organization_id'])
    );
    expect(await tableColumns('auth_organization')).toEqual(
      expect.arrayContaining(['id', 'name', 'slug', 'billing_customer_id', 'created_at'])
    );
    expect(await tableColumns('auth_member')).toEqual(
      expect.arrayContaining(['id', 'organization_id', 'user_id', 'role', 'created_at'])
    );
    expect(await tableColumns('auth_invitation')).toEqual(
      expect.arrayContaining([
        'id',
        'organization_id',
        'email',
        'role',
        'status',
        'expires_at',
        'inviter_id',
      ])
    );
    expect(await tableColumns('auth_account')).toEqual(
      expect.arrayContaining(['id', 'issuer', 'account_id', 'provider_id', 'user_id'])
    );
    expect(await tableColumns('auth_verification')).toEqual(
      expect.arrayContaining(['id', 'identifier', 'value', 'expires_at'])
    );
    expect(await tableColumns('marketing_offer_leads')).toEqual(
      expect.arrayContaining([
        'email',
        'status',
        'stripe_promotion_code_id',
        'promotion_code',
        'expires_at',
      ])
    );
  });

  it('preserves the last organization Owner and permits ordered ownership transfer', async () => {
    const suffix = crypto.randomUUID();
    const customerId = `owner-customer-${suffix}`;
    const organizationId = `owner-organization-${suffix}`;
    const ownerId = `owner-user-${suffix}`;
    const successorId = `owner-successor-${suffix}`;
    const now = Date.now();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'team')`).bind(
        customerId,
        `${customerId}@example.com`
      ),
      env.DB.prepare(
        `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
         VALUES (?, ?, ?, 'team', 'active', 2)`
      ).bind(crypto.randomUUID(), customerId, crypto.randomUUID()),
      ...[ownerId, successorId].map(userId =>
        env.DB.prepare(
          `INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`
        ).bind(userId, userId, `${userId}@example.com`, now, now)
      ),
      env.DB.prepare(
        `INSERT INTO auth_organization
           (id, name, slug, billing_customer_id, created_at)
         VALUES (?, 'Example', ?, ?, ?)`
      ).bind(organizationId, organizationId, customerId, now),
      env.DB.prepare(
        `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'owner', ?)`
      ).bind(crypto.randomUUID(), organizationId, ownerId, now),
      env.DB.prepare(
        `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'member', ?)`
      ).bind(crypto.randomUUID(), organizationId, successorId, now),
    ]);

    await expect(
      env.DB.prepare(`DELETE FROM auth_member WHERE organization_id = ? AND user_id = ?`)
        .bind(organizationId, ownerId)
        .run()
    ).rejects.toThrow('organization must retain an owner');
    await expect(
      env.DB.prepare(
        `UPDATE auth_member SET role = 'member' WHERE organization_id = ? AND user_id = ?`
      )
        .bind(organizationId, ownerId)
        .run()
    ).rejects.toThrow('organization must retain an owner');

    const memberRowsResult = await env.DB.prepare(
      `SELECT id, user_id AS userId FROM auth_member WHERE organization_id = ? ORDER BY role DESC`
    )
      .bind(organizationId)
      .all();
    const memberRows = Schema.decodeUnknownSync(MemberIdentityRowsSchema)(memberRowsResult.results);
    const successor = memberRows.find(row => row.userId === successorId);
    const owner = memberRows.find(row => row.userId === ownerId);
    if (successor === undefined || owner === undefined) {
      throw new Error('ownership transfer fixture is incomplete');
    }

    const transferResults = await env.DB.batch([
      env.DB.prepare(
        `UPDATE auth_member SET role = 'owner'
         WHERE id = ? AND organization_id = ? AND role IN ('admin', 'member')`
      ).bind(successor.id, organizationId),
      env.DB.prepare(
        `UPDATE auth_member SET role = 'admin'
         WHERE id = ? AND organization_id = ? AND role = 'owner'`
      ).bind(owner.id, organizationId),
    ]);
    expect(transferResults.map((result: D1Result) => result.meta.changes)).toEqual([1, 1]);

    const rolesResult = await env.DB.prepare(
      `SELECT user_id AS userId, role FROM auth_member WHERE organization_id = ? ORDER BY user_id`
    )
      .bind(organizationId)
      .all();
    const roles = Schema.decodeUnknownSync(MemberRoleRowsSchema)(rolesResult.results);
    expect(roles).toEqual(
      expect.arrayContaining([
        { userId: ownerId, role: 'admin' },
        { userId: successorId, role: 'owner' },
      ])
    );
  });

  it('atomically enforces active paid organization seats', async () => {
    const suffix = crypto.randomUUID();
    const customerId = `organization-customer-${suffix}`;
    const organizationId = `organization-${suffix}`;
    const ownerId = `organization-owner-${suffix}`;
    const memberId = `organization-member-${suffix}`;
    const extraId = `organization-extra-${suffix}`;
    const now = Date.now();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'team')`).bind(
        customerId,
        `${customerId}@example.com`
      ),
      env.DB.prepare(
        `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
         VALUES (?, ?, ?, 'team', 'active', 2)`
      ).bind(crypto.randomUUID(), customerId, crypto.randomUUID()),
      ...[ownerId, memberId, extraId].map(userId =>
        env.DB.prepare(
          `INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`
        ).bind(userId, userId, `${userId}@example.com`, now, now)
      ),
      env.DB.prepare(
        `INSERT INTO auth_organization
           (id, name, slug, billing_customer_id, created_at)
         VALUES (?, 'Example', ?, ?, ?)`
      ).bind(organizationId, organizationId, customerId, now),
      env.DB.prepare(
        `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'owner', ?)`
      ).bind(crypto.randomUUID(), organizationId, ownerId, now),
    ]);

    const finalSeatAttempts = await Promise.allSettled(
      [memberId, extraId].map(userId =>
        env.DB.prepare(
          `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
           VALUES (?, ?, ?, 'member', ?)`
        )
          .bind(crypto.randomUUID(), organizationId, userId, now)
          .run()
      )
    );
    expect(finalSeatAttempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(finalSeatAttempts.filter(result => result.status === 'rejected')).toHaveLength(1);

    // The owner-integrity trigger intentionally prevents teardown from deleting the last Owner.
  });
});
