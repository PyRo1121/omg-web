import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  changeAdminCustomerTag,
  createAdminCustomerBillingPortal,
  createAdminCustomerNote,
  createAdminCustomerTag,
  deleteAdminCustomerNote,
} from './admin-customer-mutations.server';
import type { LicensingSummaryEnvironment } from './licensing-service.server';
import { siteSessionResponse } from '../../../tests/test-utils';

const identity = {
  id: 'better-auth-admin',
  email: 'operator@example.com',
  name: 'Operator',
  emailVerified: true,
};

interface RecordedRequest {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
  readonly body: unknown;
}

class MutationServiceStub {
  readonly requests: Array<RecordedRequest> = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = request.body === null ? null : await request.json();
    this.requests.push({
      method: request.method,
      pathname: url.pathname,
      search: url.search,
      body,
    });
    if (url.pathname === '/api/internal/site-session') {
      return siteSessionResponse({ customerId: 'operator-customer-id' });
    }
    if (url.pathname === '/api/billing/portal') {
      return Response.json({ success: true, url: 'https://billing.stripe.com/p/session' });
    }
    return Response.json({ success: true, note_id: 'private-new-note-id' });
  }
}

function environment(service: MutationServiceStub): LicensingSummaryEnvironment {
  return {
    DB: {
      prepare: sql => ({
        bind: (...bindings) => ({
          first: async () => {
            if (sql === 'SELECT role FROM auth_user WHERE id = ?') {
              expect(bindings).toEqual([identity.id]);
              return { role: 'admin' };
            }
            if (sql === 'SELECT id FROM customers WHERE email = ?') {
              expect(bindings).toEqual(['customer@example.com']);
              return { id: 'private-customer-id' };
            }
            if (sql.includes('FROM customer_notes')) {
              expect(bindings).toEqual([
                'private-customer-id',
                'Follow-up scheduled.',
                '2026-08-27T12:00:00.000Z',
              ]);
              return { id: 'private-note-id', match_count: 1 };
            }
            if (sql.includes('FROM customer_tags')) {
              expect(bindings).toEqual(['Expansion']);
              return { id: 'private-tag-id' };
            }
            throw new Error(`Unexpected query: ${sql}`);
          },
        }),
      }),
    },
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

function mutationRequests(service: MutationServiceStub): ReadonlyArray<RecordedRequest> {
  return service.requests.filter(request => request.pathname !== '/api/internal/site-session');
}

describe('admin customer mutations', () => {
  it('resolves private customer, note, and tag identifiers only on the server', async () => {
    const service = new MutationServiceStub();
    const env = environment(service);

    await Effect.runPromise(
      createAdminCustomerNote(identity, env, {
        email: 'customer@example.com',
        content: 'Follow-up scheduled.',
        noteType: 'success',
      })
    );
    await Effect.runPromise(
      deleteAdminCustomerNote(identity, env, {
        email: 'customer@example.com',
        content: 'Follow-up scheduled.',
        createdAt: '2026-08-27T12:00:00.000Z',
      })
    );
    await Effect.runPromise(
      changeAdminCustomerTag(identity, env, {
        email: 'customer@example.com',
        tagName: 'Expansion',
        intent: 'assign',
      })
    );
    await Effect.runPromise(
      changeAdminCustomerTag(identity, env, {
        email: 'customer@example.com',
        tagName: 'Expansion',
        intent: 'remove',
      })
    );

    expect(mutationRequests(service)).toEqual([
      {
        method: 'POST',
        pathname: '/api/admin/notes',
        search: '',
        body: {
          customerId: 'private-customer-id',
          content: 'Follow-up scheduled.',
          noteType: 'success',
        },
      },
      {
        method: 'DELETE',
        pathname: '/api/admin/notes',
        search: '?noteId=private-note-id',
        body: null,
      },
      {
        method: 'POST',
        pathname: '/api/admin/customer-tags',
        search: '',
        body: { customerId: 'private-customer-id', tagId: 'private-tag-id' },
      },
      {
        method: 'DELETE',
        pathname: '/api/admin/customer-tags',
        search: '?customerId=private-customer-id&tagId=private-tag-id',
        body: null,
      },
    ]);
  });

  it('creates catalog tags and delegated billing sessions through the admin session', async () => {
    const service = new MutationServiceStub();
    const env = environment(service);

    await Effect.runPromise(
      createAdminCustomerTag(identity, env, {
        email: 'customer@example.com',
        name: 'Needs review',
        color: '#ff00aa',
        description: 'Manual follow-up',
      })
    );
    const portal = await Effect.runPromise(
      createAdminCustomerBillingPortal(identity, env, 'customer@example.com')
    );

    expect(portal).toEqual({ url: 'https://billing.stripe.com/p/session' });
    expect(mutationRequests(service)).toEqual([
      {
        method: 'POST',
        pathname: '/api/admin/tags',
        search: '',
        body: { name: 'Needs review', color: '#ff00aa', description: 'Manual follow-up' },
      },
      {
        method: 'POST',
        pathname: '/api/billing/portal',
        search: '',
        body: { email: 'customer@example.com' },
      },
    ]);
  });

  it('fails closed when a visible note no longer resolves to one stored row', async () => {
    const service = new MutationServiceStub();
    const env = environment(service);
    const basePrepare = env.DB.prepare.bind(env.DB);
    const conflictingEnv: LicensingSummaryEnvironment = {
      ...env,
      DB: {
        prepare: sql =>
          sql.includes('FROM customer_notes')
            ? {
                bind: () => ({ first: async () => ({ id: 'private-note-id', match_count: 2 }) }),
              }
            : basePrepare(sql),
      },
    };

    const exit = await Effect.runPromiseExit(
      deleteAdminCustomerNote(identity, conflictingEnv, {
        email: 'customer@example.com',
        content: 'Follow-up scheduled.',
        createdAt: '2026-08-27T12:00:00.000Z',
      })
    );

    expect(exit._tag).toBe('Failure');
    expect(mutationRequests(service)).toEqual([]);
  });
});
