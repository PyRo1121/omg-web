import '../src/cloudflare-test.d.ts';
import { env } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import { createShadowAuth, type AuthEnvironment } from '../../../site/src/lib/server/auth.server';

const AUTH_SECRET = 'organization-seat-integration-secret-with-32-characters';
const MemberCountRowSchema = Schema.Struct({ count: Schema.Number });
const InvitationStatusRowsSchema = Schema.Array(
  Schema.Struct({ email: Schema.String, status: Schema.String })
);

function authEnvironment(): AuthEnvironment {
  return {
    BETTER_AUTH_SECRET: AUTH_SECRET,
    DB: env.DB,
    GITHUB_CLIENT_ID: 'test-github-client',
    GITHUB_CLIENT_SECRET: 'test-github-secret',
    LICENSING_API: {
      fetch: async () => new Response(null, { status: 503 }),
    },
    SVELTE_BFF_SECRET: 'test-svelte-bff-secret',
  };
}

/** Reproduce Better Auth's cookie signature (HMAC-SHA256, base64) for the real session format. */
async function makeSignature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function sessionCookie(token: string): Promise<string> {
  const signature = await makeSignature(token, AUTH_SECRET);
  return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function acceptanceRequest(invitationId: string, cookie: string): Request {
  return new Request('https://shadow.example/api/auth/organization/accept-invitation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: 'https://shadow.example',
    },
    body: JSON.stringify({ invitationId }),
  });
}

describe('Better Auth organization seat integration', () => {
  it('allows only one concurrent acceptance for the final paid seat', async () => {
    const suffix = crypto.randomUUID();
    const customerId = `customer-${suffix}`;
    const organizationId = `organization-${suffix}`;
    const ownerId = `owner-${suffix}`;
    const firstUserId = `first-user-${suffix}`;
    const secondUserId = `second-user-${suffix}`;
    const firstEmail = `first-${suffix}@example.com`;
    const secondEmail = `second-${suffix}@example.com`;
    const firstInvitationId = `first-invitation-${suffix}`;
    const secondInvitationId = `second-invitation-${suffix}`;
    const firstToken = `first-session-${suffix}`;
    const secondToken = `second-session-${suffix}`;
    const now = Date.now();
    const expiresAt = now + 60 * 60 * 1000;

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'team')`).bind(
        customerId,
        `billing-${suffix}@example.com`
      ),
      env.DB.prepare(
        `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
         VALUES (?, ?, ?, 'team', 'active', 2)`
      ).bind(`license-${suffix}`, customerId, `key-${suffix}`),
      ...[
        [ownerId, `owner-${suffix}@example.com`],
        [firstUserId, firstEmail],
        [secondUserId, secondEmail],
      ].map(([userId, email]) =>
        env.DB.prepare(
          `INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`
        ).bind(userId, userId, email, now, now)
      ),
      env.DB.prepare(
        `INSERT INTO auth_organization
           (id, name, slug, billing_customer_id, created_at)
         VALUES (?, 'Example', ?, ?, ?)`
      ).bind(organizationId, organizationId, customerId, now),
      env.DB.prepare(
        `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'owner', ?)`
      ).bind(`owner-member-${suffix}`, organizationId, ownerId, now),
      env.DB.prepare(
        `INSERT INTO auth_invitation
           (id, organization_id, email, role, status, expires_at, created_at, inviter_id)
         VALUES (?, ?, ?, 'member', 'pending', ?, ?, ?)`
      ).bind(firstInvitationId, organizationId, firstEmail, expiresAt, now, ownerId),
      env.DB.prepare(
        `INSERT INTO auth_invitation
           (id, organization_id, email, role, status, expires_at, created_at, inviter_id)
         VALUES (?, ?, ?, 'member', 'pending', ?, ?, ?)`
      ).bind(secondInvitationId, organizationId, secondEmail, expiresAt, now, ownerId),
      env.DB.prepare(
        `INSERT INTO auth_session
           (id, expires_at, token, created_at, updated_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(`first-session-id-${suffix}`, expiresAt, firstToken, now, now, firstUserId),
      env.DB.prepare(
        `INSERT INTO auth_session
           (id, expires_at, token, created_at, updated_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(`second-session-id-${suffix}`, expiresAt, secondToken, now, now, secondUserId),
    ]);

    const auth = createShadowAuth(authEnvironment(), new URL('https://shadow.example'));
    const attempts = await Promise.allSettled([
      auth.handler(acceptanceRequest(firstInvitationId, await sessionCookie(firstToken))),
      auth.handler(acceptanceRequest(secondInvitationId, await sessionCookie(secondToken))),
    ]);
    const successfulAttempts = attempts.filter(
      result => result.status === 'fulfilled' && result.value.ok
    );
    const rejectedAttempts = attempts.filter(
      result => result.status === 'rejected' || !result.value.ok
    );

    expect(successfulAttempts).toHaveLength(1);
    expect(rejectedAttempts).toHaveLength(1);

    const memberCountRow = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM auth_member WHERE organization_id = ?`
    )
      .bind(organizationId)
      .first();
    const memberCount = Schema.decodeUnknownSync(MemberCountRowSchema)(memberCountRow);
    expect(memberCount.count).toBe(2);

    const invitationStatusResult = await env.DB.prepare(
      `SELECT email, status FROM auth_invitation WHERE organization_id = ? ORDER BY email`
    )
      .bind(organizationId)
      .all();
    const invitationStatuses = Schema.decodeUnknownSync(InvitationStatusRowsSchema)(
      invitationStatusResult.results
    );
    expect(invitationStatuses.filter(invitation => invitation.status === 'accepted')).toHaveLength(
      1
    );
    expect(invitationStatuses.filter(invitation => invitation.status === 'pending')).toHaveLength(
      1
    );
  });
});
