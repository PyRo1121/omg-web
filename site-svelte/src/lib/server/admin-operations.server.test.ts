import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  loadAdminAudit,
  loadAdminFirehose,
  loadAdminExport,
  loadInternalAdminFirehose,
  parseAdminAuditQuery,
  parseFirehoseSince,
} from './admin-operations.server';
import type { LicensingSummaryEnvironment } from './licensing-service.server';

const identity = {
  id: 'better-auth-admin',
  email: 'operator@example.com',
  name: 'Operator',
  emailVerified: true,
};

class OperationsServiceStub {
  readonly paths: Array<string> = [];
  readonly internalSecrets: Array<string | null> = [];

  constructor(
    private readonly exportResponse: () => Response = () =>
      new Response('created_at,action\n2026-08-30,auth.login\n', {
        headers: { 'Content-Type': 'text/csv' },
      })
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.paths.push(`${url.pathname}${url.search}`);
    this.internalSecrets.push(request.headers.get('X-Admin-Secret'));
    if (url.pathname === '/api/internal/site-session') {
      return Response.json({
        token: 'server-token',
        expiresAt: '2026-09-01T00:00:00.000Z',
        customerId: 'operator-id',
      });
    }
    if (url.pathname === '/api/admin/audit-log') {
      return Response.json({
        logs: [
          {
            id: 'private-audit-id',
            customer_id: 'private-customer-id',
            user_email: 'operator@example.com',
            action: 'auth.login',
            ip_address: '192.0.2.1',
            metadata: '{"private":"payload"}',
            created_at: '2026-08-30 12:00:00',
          },
        ],
        pagination: { page: 2, limit: 25, total: 30, pages: 2 },
      });
    }
    if (url.pathname === '/api/admin/firehose' || url.pathname === '/api/internal/admin/firehose') {
      return Response.json({
        events: [
          {
            id: 'private-event-id',
            event_type: 'command',
            event_name: 'install',
            properties: { machine_id: 'private-machine-id' },
            timestamp: '2026-08-30T12:00:00.000Z',
            session_id: 'private-session-id',
            machine_id: 'private-machine-id',
            version: '1.4.0',
            platform: 'linux',
            duration_ms: 120,
            created_at: '2026-08-30 12:00:00',
          },
        ],
        count: 1,
        timestamp: '2026-08-30T12:00:01.000Z',
      });
    }
    if (url.pathname === '/api/admin/export/audit') {
      return this.exportResponse();
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}

function environment(service: OperationsServiceStub): LicensingSummaryEnvironment {
  return {
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ role: 'admin' }) }) }) },
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-secret',
  };
}

describe('admin operations service', () => {
  it('parses bounded audit and firehose queries', () => {
    expect(
      parseAdminAuditQuery(new URL('https://example.com/admin/audit/?page=2&action=auth.login'))
    ).toEqual({ page: 2, action: 'auth.login' });
    expect(parseAdminAuditQuery(new URL('https://example.com/admin/audit/?page=0'))).toBeNull();
    expect(
      parseAdminAuditQuery(new URL('https://example.com/admin/audit/?action=DROP%20TABLE'))
    ).toBeNull();
    expect(parseFirehoseSince('2026-08-30T12:00:00')).toBe('2026-08-30T12:00:00');
    expect(parseFirehoseSince('2026-08-30 12:00:00')).toBeUndefined();
  });

  it('removes database identifiers and metadata from audit page data', async () => {
    const service = new OperationsServiceStub();
    const value = await Effect.runPromise(
      loadAdminAudit(identity, environment(service), { page: 2, action: 'auth.login' })
    );

    expect(value.logs).toEqual([
      {
        email: 'operator@example.com',
        action: 'auth.login',
        ipAddress: '192.0.2.1',
        createdAt: '2026-08-30 12:00:00',
      },
    ]);
    expect(JSON.stringify(value)).not.toContain('private-audit-id');
    expect(JSON.stringify(value)).not.toContain('private-customer-id');
    expect(JSON.stringify(value)).not.toContain('metadata');
    expect(service.paths.at(-1)).toBe('/api/admin/audit-log?page=2&limit=25&action=auth.login');
  });

  it('removes event, machine, session, and property identifiers from live data', async () => {
    const service = new OperationsServiceStub();
    const value = await Effect.runPromise(
      loadAdminFirehose(identity, environment(service), '2026-08-30T11:59:00')
    );

    expect(value.events[0]).toEqual({
      eventType: 'command',
      eventName: 'install',
      timestamp: '2026-08-30T12:00:00.000Z',
      version: '1.4.0',
      platform: 'linux',
      durationMs: 120,
      createdAt: '2026-08-30 12:00:00',
    });
    expect(JSON.stringify(value)).not.toMatch(/private-(?:event|machine|session)-id/u);
    expect(JSON.stringify(value)).not.toContain('properties');
  });

  it('polls through the internal secret without minting a Worker session', async () => {
    const service = new OperationsServiceStub();
    const value = await Effect.runPromise(loadInternalAdminFirehose(environment(service), null));

    expect(value.events).toHaveLength(1);
    expect(service.paths).toEqual(['/api/internal/admin/firehose?limit=50']);
    expect(service.internalSecrets).toEqual(['private-secret']);
  });

  it('rejects malformed UTF-8 in a private CSV export', async () => {
    const service = new OperationsServiceStub(() => {
      const prefix = new TextEncoder().encode('created_at,action\n2026-08-30,');
      const buffer = new ArrayBuffer(prefix.byteLength + 1);
      const body = new Uint8Array(buffer);
      body.set(prefix);
      body[prefix.byteLength] = 0xff;
      return new Response(buffer, { headers: { 'Content-Type': 'text/csv' } });
    });

    const exit = await Effect.runPromiseExit(
      loadAdminExport(identity, environment(service), 'audit')
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('opens an audited CSV export through the private session', async () => {
    const service = new OperationsServiceStub();
    const bytes = await Effect.runPromise(loadAdminExport(identity, environment(service), 'audit'));

    expect(new TextDecoder().decode(bytes)).toContain('auth.login');
    expect(service.paths.at(-1)).toBe('/api/admin/export/audit');
  });
});
