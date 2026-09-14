import { describe, expect, it } from 'vitest';
import { createOrganizationAction } from '../../../lib/server/organization-route-actions.server';

function event(body: string) {
  return {
    platform: undefined,
    request: new Request('https://shadow.example/dashboard/organization/?/createOrganization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }),
    url: new URL('https://shadow.example/dashboard/organization/'),
  };
}

describe('organization route action', () => {
  it('rejects an oversized body before authentication or database work', async () => {
    const result = await createOrganizationAction(
      event(`name=${'x'.repeat(9000)}&slug=acme-engineering`)
    );

    expect('status' in result).toBe(true);
    if (!('status' in result)) throw new Error('Expected an action failure');
    expect(result.status).toBe(413);
    expect(result.data).toEqual({
      kind: 'organization-error',
      message: 'Enter a valid workspace name and URL slug.',
    });
  });

  it('rejects malformed workspace details before platform access', async () => {
    const result = await createOrganizationAction(event('name=A&slug=not valid'));

    expect('status' in result).toBe(true);
    if (!('status' in result)) throw new Error('Expected an action failure');
    expect(result.status).toBe(400);
  });

  it('fails closed when the platform is unavailable', async () => {
    await expect(
      createOrganizationAction(event('name=Acme+Engineering&slug=acme-engineering'))
    ).rejects.toMatchObject({ status: 503 });
  });
});
