import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { loadAdminCustomerWorkspace } from './admin-customer-support.server';
import type { LicensingSummaryEnvironment } from './licensing-service.server';
import { siteSessionResponse } from './test-utils';

const identity = {
  id: 'better-auth-admin',
  email: 'operator@example.com',
  name: 'Operator',
  emailVerified: true,
};

class SupportServiceStub {
  readonly requests: Array<{ readonly pathname: string; readonly search: string }> = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.requests.push({ pathname: url.pathname, search: url.search });
    switch (url.pathname) {
      case '/api/internal/site-session':
        return siteSessionResponse({ customerId: 'operator-customer-id' });
      case '/api/admin/user':
        return Response.json({
          user: {
            id: 'private-customer-id',
            email: 'customer@example.com',
            company: 'Acme',
            stripe_customer_id: 'cus_private',
            telemetry_opt_out: 0,
            created_at: '2026-08-01T00:00:00.000Z',
            updated_at: '2026-08-28T00:00:00.000Z',
          },
          license: {
            id: 'private-license-id',
            customer_id: 'private-customer-id',
            license_key: 'private-license-key',
            tier: 'team',
            status: 'active',
            max_seats: 5,
            max_machines: 8,
            expires_at: null,
          },
          machines: [],
          usage: [],
        });
      case '/api/admin/customer-health':
        return Response.json({
          health: {
            customer_id: 'private-customer-id',
            overall_score: 82,
            engagement_score: 88,
            activation_score: 91,
            growth_score: 74,
            risk_score: 18,
            lifecycle_stage: 'power_user',
            updated_at: '2026-08-28T12:00:00.000Z',
          },
        });
      case '/api/admin/notes':
        return Response.json({
          notes: [
            {
              id: 'private-note-id',
              customer_id: 'private-customer-id',
              author_id: 'private-author-id',
              note_type: 'success',
              content: 'Expansion review scheduled.',
              is_pinned: 1,
              created_at: '2026-08-27T12:00:00.000Z',
              updated_at: '2026-08-28T12:00:00.000Z',
              author_email: 'operator@example.com',
            },
          ],
        });
      case '/api/admin/customer-tags':
        return Response.json({
          tags: [
            {
              id: 'private-tag-id',
              name: 'Expansion',
              color: '#22c55e',
              description: 'Ready for account growth',
              created_by: 'private-author-id',
              created_at: '2026-08-20T12:00:00.000Z',
            },
          ],
        });
      case '/api/admin/tags':
        return Response.json({
          tags: [
            {
              id: 'private-tag-id',
              name: 'Expansion',
              color: '#22c55e',
              description: 'Ready for account growth',
              created_by: 'private-author-id',
              created_at: '2026-08-20T12:00:00.000Z',
              usage_count: 4,
            },
          ],
        });
      default:
        return Response.json({ error: 'not found' }, { status: 404 });
    }
  }
}

class MissingHealthServiceStub extends SupportServiceStub {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/customer-health') {
      this.requests.push({ pathname: url.pathname, search: url.search });
      return Response.json({ error: 'missing' }, { status: 404 });
    }
    return super.fetch(request);
  }
}

function environment(service: SupportServiceStub): LicensingSummaryEnvironment {
  return {
    DB: {
      prepare: sql => ({
        bind: (...bindings) => ({
          first: async () => {
            if (sql === 'SELECT role FROM auth_user WHERE id = ?') {
              expect(bindings).toEqual([identity.id]);
              return { role: 'admin' };
            }
            expect(sql).toBe('SELECT id FROM customers WHERE email = ?');
            expect(bindings).toEqual(['customer@example.com']);
            return { id: 'private-customer-id' };
          },
        }),
      }),
    },
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

describe('admin customer support service', () => {
  it('loads health, notes, and tags without projecting private identifiers', async () => {
    const service = new SupportServiceStub();
    const { support } = await Effect.runPromise(
      loadAdminCustomerWorkspace(identity, environment(service), 'customer@example.com')
    );

    expect(support).toEqual({
      health: {
        kind: 'available',
        value: {
          activationScore: 91,
          engagementScore: 88,
          growthScore: 74,
          lifecycleStage: 'power_user',
          overallScore: 82,
          riskScore: 18,
          updatedAt: '2026-08-28T12:00:00.000Z',
        },
      },
      notes: {
        kind: 'available',
        values: [
          {
            authorEmail: 'operator@example.com',
            content: 'Expansion review scheduled.',
            createdAt: '2026-08-27T12:00:00.000Z',
            noteType: 'success',
            pinned: true,
            updatedAt: '2026-08-28T12:00:00.000Z',
          },
        ],
      },
      assignedTags: {
        kind: 'available',
        values: [
          {
            color: '#22c55e',
            description: 'Ready for account growth',
            name: 'Expansion',
          },
        ],
      },
      tagCatalog: {
        kind: 'available',
        values: [
          {
            color: '#22c55e',
            description: 'Ready for account growth',
            name: 'Expansion',
            usageCount: 4,
          },
        ],
      },
    });
    const serialized = JSON.stringify(support);
    for (const identifier of [
      'private-customer-id',
      'private-note-id',
      'private-tag-id',
      'private-author-id',
    ]) {
      expect(serialized).not.toContain(identifier);
    }
    expect(service.requests.slice(1)).toEqual([
      { pathname: '/api/admin/user', search: '?id=private-customer-id' },
      { pathname: '/api/admin/customer-health', search: '?customerId=private-customer-id' },
      { pathname: '/api/admin/notes', search: '?customerId=private-customer-id' },
      { pathname: '/api/admin/customer-tags', search: '?customerId=private-customer-id' },
      { pathname: '/api/admin/tags', search: '' },
    ]);
  });

  it('keeps a missing health snapshot distinct from unavailable support data', async () => {
    const service = new MissingHealthServiceStub();
    const { support } = await Effect.runPromise(
      loadAdminCustomerWorkspace(identity, environment(service), 'customer@example.com')
    );

    expect(support.health).toEqual({ kind: 'empty' });
    expect(support.notes.kind).toBe('available');
  });

  it('loads the selected workspace through one private admin session', async () => {
    const service = new SupportServiceStub();
    const workspace = await Effect.runPromise(
      loadAdminCustomerWorkspace(identity, environment(service), 'customer@example.com')
    );

    expect(workspace.detail).toMatchObject({
      email: 'customer@example.com',
      tier: 'team',
      status: 'active',
    });
    expect(workspace.support.health.kind).toBe('available');
    expect(
      service.requests.filter(request => request.pathname === '/api/internal/site-session')
    ).toHaveLength(1);
    expect(JSON.stringify(workspace)).not.toContain('private-license-key');
    expect(JSON.stringify(workspace)).not.toContain('cus_private');
  });
});
