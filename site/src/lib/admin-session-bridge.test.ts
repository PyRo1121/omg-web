import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AdminSessionBridge,
  AuthBridgeForbidden,
  AuthBridgeNetworkError,
  AuthBridgeUnauthorized,
  AuthBridgeWorkerRejected,
  parseAdminApiSecret,
  parseWorkersApiUrl,
  responseFromAuthBridgeExit,
  type AdminRoleLookup,
  type WorkerSessionPoster,
} from './admin-session-bridge';
import { AdminSessionParseError, type AdminSessionRequest } from './contracts/admin-session';

const validWorkerBody = {
  token: 'tok_abc',
  expiresAt: '2026-01-01T00:00:00.000Z',
  customerId: 'cust_1',
};

async function requiredUrl() {
  return Effect.runPromise(parseWorkersApiUrl('https://api.example.com'));
}

async function requiredSecret() {
  return Effect.runPromise(parseAdminApiSecret('s3cret'));
}

function roleLookup(role: 'admin' | 'user' | null): AdminRoleLookup {
  return {
    lookupRole() {
      return Effect.succeed(role);
    },
  };
}

function posterOf(response: Response): WorkerSessionPoster {
  return {
    post(_url: string, _secret: string, _body: AdminSessionRequest) {
      return Effect.succeed(response);
    },
  };
}

function jsonResponse(status: number, serializedBody: string): Response {
  return new Response(serializedBody, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseWorkersApiUrl', () => {
  it('rejects a missing URL', async () => {
    const exit = await Effect.runPromiseExit(parseWorkersApiUrl(undefined));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects a fallback-style empty string', async () => {
    const exit = await Effect.runPromiseExit(parseWorkersApiUrl(''));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('responseFromAuthBridgeExit', () => {
  it('maps unauthorized to 401', () => {
    const exit = Exit.fail(new AuthBridgeUnauthorized());
    expect(responseFromAuthBridgeExit(exit).status).toBe(401);
  });

  it('maps forbidden to 403', () => {
    const exit = Exit.fail(new AuthBridgeForbidden());
    expect(responseFromAuthBridgeExit(exit).status).toBe(403);
  });

  it('maps an invalid Worker payload to 502', () => {
    const exit = Exit.fail(
      new AdminSessionParseError('Worker session response has an invalid shape')
    );
    expect(responseFromAuthBridgeExit(exit).status).toBe(502);
  });
});

describe('AdminSessionBridge.mint', () => {
  it('returns token and expiresAt for an admin', async () => {
    const bridge = new AdminSessionBridge(
      roleLookup('admin'),
      posterOf(jsonResponse(200, JSON.stringify(validWorkerBody))),
      await requiredUrl(),
      await requiredSecret()
    );
    const result = await Effect.runPromise(
      bridge.mint({ id: 'user_1', email: 'Ada@Example.COM', name: 'Ada' })
    );
    expect(result.token).toBe('tok_abc');
    expect(result.expiresAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('fails forbidden for a non-admin', async () => {
    const bridge = new AdminSessionBridge(
      roleLookup('user'),
      posterOf(jsonResponse(200, JSON.stringify(validWorkerBody))),
      await requiredUrl(),
      await requiredSecret()
    );
    const exit = await Effect.runPromiseExit(
      bridge.mint({ id: 'user_1', email: 'ada@example.com', name: 'Ada' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (exit._tag === 'Failure') {
      const mapped = responseFromAuthBridgeExit(exit);
      expect(mapped.status).toBe(403);
    }
  });

  it('fails 502 when the Worker payload is invalid', async () => {
    const bridge = new AdminSessionBridge(
      roleLookup('admin'),
      posterOf(jsonResponse(200, JSON.stringify({ token: 123 }))),
      await requiredUrl(),
      await requiredSecret()
    );
    const exit = await Effect.runPromiseExit(
      bridge.mint({ id: 'user_1', email: 'ada@example.com', name: 'Ada' })
    );
    expect(responseFromAuthBridgeExit(exit).status).toBe(502);
  });

  it('fails 502 when the Worker rejects the request', async () => {
    const bridge = new AdminSessionBridge(
      roleLookup('admin'),
      posterOf(jsonResponse(401, JSON.stringify({ error: 'Unauthorized' }))),
      await requiredUrl(),
      await requiredSecret()
    );
    const exit = await Effect.runPromiseExit(
      bridge.mint({ id: 'user_1', email: 'ada@example.com', name: 'Ada' })
    );
    expect(exit._tag === 'Failure').toBe(true);
    expect(responseFromAuthBridgeExit(exit).status).toBe(502);
  });
});

describe('AuthBridgeWorkerRejected', () => {
  it('is a tagged error', () => {
    const error = new AuthBridgeWorkerRejected(401);
    expect(error._tag).toBe('AuthBridgeWorkerRejected');
    expect(error.status).toBe(401);
  });
});

describe('AuthBridgeNetworkError', () => {
  it('is a tagged error', () => {
    const error = new AuthBridgeNetworkError('offline');
    expect(error._tag).toBe('AuthBridgeNetworkError');
  });
});
