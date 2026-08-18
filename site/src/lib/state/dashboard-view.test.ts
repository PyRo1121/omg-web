import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { syncAdminAuth } from './dashboard-view';

function jsonResponse(status: number, serializedBody: string): Response {
  return new Response(serializedBody, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('syncAdminAuth', () => {
  it('skips the bridge when a token already exists', async () => {
    const storage = new Map<string, string>([['omg_session_token', 'existing']]);
    let fetched = false;
    const exit = await Effect.runPromiseExit(
      syncAdminAuth(
        async () => {
          fetched = true;
          return jsonResponse(
            200,
            JSON.stringify({ token: 'new', expiresAt: '2026-01-01T00:00:00.000Z' })
          );
        },
        {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        }
      )
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(fetched).toBe(false);
    expect(storage.get('omg_session_token')).toBe('existing');
  });

  it('stores the decoded token on success', async () => {
    const storage = new Map<string, string>();
    const exit = await Effect.runPromiseExit(
      syncAdminAuth(
        async () =>
          jsonResponse(
            200,
            JSON.stringify({ token: 'tok_abc', expiresAt: '2026-01-01T00:00:00.000Z' })
          ),
        {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        }
      )
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(storage.get('omg_session_token')).toBe('tok_abc');
  });

  it('fails when the bridge payload is invalid', async () => {
    const storage = new Map<string, string>();
    const exit = await Effect.runPromiseExit(
      syncAdminAuth(async () => jsonResponse(200, JSON.stringify({ token: 123 })), {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      })
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(storage.get('omg_session_token')).toBeUndefined();
  });
});
