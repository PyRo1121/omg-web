import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AuditPage from './+page.svelte';

describe('operator audit page', () => {
  it('renders the privacy-reduced audit projection and audited exports', () => {
    const result = render(AuditPage, {
      props: {
        params: {},
        data: {
          action: 'auth.login',
          audit: {
            logs: [
              {
                email: 'operator@example.com',
                action: 'auth.login',
                ipAddress: '192.0.2.1',
                createdAt: '2026-08-30 12:00:00',
              },
            ],
            pagination: { page: 1, limit: 25, total: 1, pages: 1 },
          },
        },
        form: null,
      },
    });

    expect(result.body).toContain('Operator audit log');
    expect(result.body).toContain('operator@example.com');
    expect(result.body).toContain('/admin/exports/audit/');
    expect(result.body).not.toContain('private-audit-id');
    expect(result.body).not.toContain('private-customer-id');
    expect(result.body).not.toContain('private-metadata-payload');
  });
});
