import { describe, expect, it } from 'vitest';
import { Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type { LicensingSummaryEnvironment } from './licensing-service.server';
import {
  OrganizationInvitationDeliveryFailed,
  sendOrganizationInvitationEmail,
} from './organization-invitation-email.server';

const SECRET = 'organization-invitation-test-secret';
const PAGE_URL = new URL('https://shadow.example/dashboard/');

function environment(
  fetch: (request: Request) => Promise<Response>
): LicensingSummaryEnvironment & { readonly BETTER_AUTH_SECRET: string } {
  return {
    BETTER_AUTH_SECRET: SECRET,
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => null }),
      }),
    },
    LICENSING_API: { fetch },
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

describe('organization invitation email transport', () => {
  it('sends a private request with an opaque invitation URL and parses the acknowledgement', async () => {
    let requestBody = '';
    const env = environment(async request => {
      expect(request.url).toBe(
        'https://omg-saas.internal/api/internal/organization-invitation-email'
      );
      expect(request.headers.get('X-Admin-Secret')).toBe('private-bff-secret');
      expect(request.headers.get('X-Internal-Call')).toBe('service-binding');
      requestBody = await request.text();
      return Response.json({ sent: true });
    });

    await expect(
      sendOrganizationInvitationEmail(
        {
          email: 'Employee@Example.com',
          expiresAt: new Date('2027-01-02T03:04:05.000Z'),
          invitationId: 'better-auth-private-id',
          organizationName: 'Acme Engineering',
          role: 'member',
        },
        env,
        PAGE_URL
      )
    ).resolves.toBeUndefined();

    const expected = Schema.decodeUnknownExit(
      Schema.fromJsonString(
        Schema.Struct({
          email: Schema.String,
          organizationName: Schema.String,
          role: Schema.String,
          invitationUrl: Schema.String,
        })
      )
    )(requestBody);
    if (Exit.isFailure(expected)) {
      throw new Error(`Email request was invalid: ${String(expected.cause)}`);
    }
    expect(expected.value.email).toBe('employee@example.com');
    expect(expected.value.invitationUrl).toMatch(
      /^https:\/\/shadow\.example\/dashboard\/organization\/invitations\/accept\/\?token=v1\./u
    );
    expect(expected.value.invitationUrl).not.toContain('better-auth-private-id');
  });

  it('keeps delivery failure explicit when the private Worker rejects the request', async () => {
    const env = environment(async () => new Response('unavailable', { status: 503 }));

    await expect(
      sendOrganizationInvitationEmail(
        {
          email: 'employee@example.com',
          expiresAt: new Date('2027-01-02T03:04:05.000Z'),
          invitationId: 'better-auth-private-id',
          organizationName: 'Acme Engineering',
          role: 'admin',
        },
        env,
        PAGE_URL
      )
    ).rejects.toBeInstanceOf(OrganizationInvitationDeliveryFailed);
  });

  it('fails closed for non-HTTPS invitation origins', async () => {
    const env = environment(async () => Response.json({ sent: true }));

    await expect(
      sendOrganizationInvitationEmail(
        {
          email: 'employee@example.com',
          expiresAt: new Date('2027-01-02T03:04:05.000Z'),
          invitationId: 'better-auth-private-id',
          organizationName: 'Acme Engineering',
          role: 'member',
        },
        env,
        new URL('http://localhost:5173/dashboard/')
      )
    ).rejects.toBeInstanceOf(OrganizationInvitationDeliveryFailed);
  });
});
