import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from '../src/api';
import { handleOrganizationInvitationEmail } from '../src/handlers/organization-invitation-email';

type OrganizationInvitationEmailSender = NonNullable<
  Parameters<typeof handleOrganizationInvitationEmail>[2]
>;
type OrganizationInvitationEmailMessage = Parameters<OrganizationInvitationEmailSender>[0];

const SVELTE_BFF_SECRET = 'test-svelte-bff-secret';
const INVITATION_URL = `https://omg.latham.cloud/dashboard/organization/invitations/accept/?token=v1.${'a'.repeat(16)}.${'b'.repeat(48)}`;

function emailEnv(rateLimitSuccess = true): Env {
  return {
    DB: env.DB,
    EMAIL: env.EMAIL,
    STRIPE_SECRET_KEY: 'stripe-test-key',
    STRIPE_WEBHOOK_SECRET: 'webhook-test-secret',
    JWT_SECRET: 'jwt-test-secret',
    JWT_PRIVATE_KEY: 'private-test-key',
    SVELTE_BFF_SECRET,
    API_RATE_LIMITER: {
      limit: async () => ({ success: rateLimitSuccess }),
    },
  };
}

function emailRequest(
  body: Record<string, string>,
  secret = SVELTE_BFF_SECRET,
  internalCall = 'service-binding'
): Request {
  return new Request('https://omg-saas.internal/api/internal/organization-invitation-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': secret,
      'X-Internal-Call': internalCall,
    },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return {
    email: 'employee@example.com',
    organizationName: 'Acme Engineering',
    role: 'member',
    invitationUrl: INVITATION_URL,
  } satisfies Record<string, string>;
}

describe('organization invitation email capability', () => {
  it('sends a bounded, escaped transactional email and returns no provider identifier', async () => {
    const sentMessages: OrganizationInvitationEmailMessage[] = [];
    const response = await handleOrganizationInvitationEmail(
      emailRequest(validBody()),
      emailEnv(),
      async message => {
        sentMessages.push(message);
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sent: true });
    expect(sentMessages).toHaveLength(1);
    const firstMessage = sentMessages[0];
    if (firstMessage === undefined) {
      throw new Error('invitation email was not captured');
    }
    expect(firstMessage.to).toBe('employee@example.com');
    expect(firstMessage.subject).not.toContain('Acme Engineering');
    expect(firstMessage.html).toContain('Acme Engineering');
    expect(firstMessage.html).toContain(
      'href="https://omg.latham.cloud/dashboard/organization/invitations/accept/?token='
    );
    expect(firstMessage.text).toContain(INVITATION_URL);

    const escapedResponse = await handleOrganizationInvitationEmail(
      emailRequest({ ...validBody(), organizationName: '<Acme>' }),
      emailEnv(),
      async message => {
        sentMessages.push(message);
      }
    );
    expect(escapedResponse.status).toBe(200);
    expect(sentMessages).toHaveLength(2);
    const escapedMessage = sentMessages[1];
    if (escapedMessage === undefined) {
      throw new Error('escaped invitation email was not captured');
    }
    expect(escapedMessage.html).toContain('&lt;Acme&gt;');
    expect(escapedMessage.html).not.toContain('<h1>Join <Acme></h1>');
  });

  it('hides the private endpoint from non-service-binding or wrong-secret callers', async () => {
    const wrongBinding = await handleOrganizationInvitationEmail(
      emailRequest(validBody(), SVELTE_BFF_SECRET, 'browser'),
      emailEnv(),
      async () => undefined
    );
    expect(wrongBinding.status).toBe(404);

    const wrongSecret = await handleOrganizationInvitationEmail(
      emailRequest(validBody(), 'wrong-secret'),
      emailEnv(),
      async () => undefined
    );
    expect(wrongSecret.status).toBe(404);
  });

  it('rejects malformed invitation URLs and oversized private bodies', async () => {
    const malformed = await handleOrganizationInvitationEmail(
      emailRequest({ ...validBody(), invitationUrl: 'https://evil.example/redirect?token=abc' }),
      emailEnv(),
      async () => undefined
    );
    expect(malformed.status).toBe(400);

    const oversized = new Request(
      'https://omg-saas.internal/api/internal/organization-invitation-email',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': SVELTE_BFF_SECRET,
          'X-Internal-Call': 'service-binding',
        },
        body: JSON.stringify({ ...validBody(), organizationName: 'x'.repeat(8 * 1024) }),
      }
    );
    const oversizedResponse = await handleOrganizationInvitationEmail(
      oversized,
      emailEnv(),
      async () => undefined
    );
    expect(oversizedResponse.status).toBe(400);
  });

  it('fails closed when the private rate limiter or email service is unavailable', async () => {
    const rateLimited = await handleOrganizationInvitationEmail(
      emailRequest(validBody()),
      emailEnv(false),
      async () => undefined
    );
    expect(rateLimited.status).toBe(429);

    const deliveryFailed = await handleOrganizationInvitationEmail(
      emailRequest(validBody()),
      emailEnv(),
      async () => {
        throw new Error('email provider unavailable');
      }
    );
    expect(deliveryFailed.status).toBe(503);
  });
});
