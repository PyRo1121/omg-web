import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

const TEST_SECRET = 'test-admin-secret';

function postJson(path: string, secret: string | null, serializedBody: string): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (secret !== null) {
    headers.set('X-Admin-Secret', secret);
  }
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: serializedBody,
  });
}

describe('open Worker routes require X-Admin-Secret', () => {
  beforeEach(() => {
    env.ADMIN_API_SECRET = TEST_SECRET;
  });

  it('returns 401 for POST /api/provision-user when the secret is missing', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/provision-user', null, JSON.stringify({ email: 'lock@example.com' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 for POST /api/provision-user when the secret is wrong', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(
        '/api/provision-user',
        'wrong-secret',
        JSON.stringify({ email: 'lock@example.com' })
      ),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 for POST /api/provision-user when ADMIN_API_SECRET is unset', async () => {
    env.ADMIN_API_SECRET = '';
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/provision-user', TEST_SECRET, JSON.stringify({ email: 'lock@example.com' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 400 for POST /api/provision-user when the secret is valid and the body is not', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/provision-user', TEST_SECRET, '{'),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('returns 401 for POST /api/init-db when the secret is missing', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(postJson('/api/init-db', null, '{}'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 for POST /api/init-db when the secret is wrong', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(postJson('/api/init-db', 'wrong-secret', '{}'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });
});
