import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  getWorkerDashboard,
  sendCodeToWorker,
  verifyCodeWithWorker,
  WorkerApiHttpError,
  type WorkerFetcher,
} from './worker-api';

const API_BASE = 'https://api.example.com';

function fetcherOf(response: Response): WorkerFetcher {
  return {
    fetch() {
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

function failedValue<A, E>(exit: Exit.Exit<A, E>): E | null {
  if (!Exit.isFailure(exit)) {
    return null;
  }
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : null;
}

describe('sendCodeToWorker', () => {
  it('rejects an invalid email before fetching', async () => {
    const exit = await Effect.runPromiseExit(
      sendCodeToWorker(API_BASE, 'not-an-email', undefined, fetcherOf(jsonResponse(200, '{}')))
    );
    const error = failedValue(exit);
    expect(error).toBeInstanceOf(WorkerApiHttpError);
    if (error instanceof WorkerApiHttpError) {
      expect(error.status).toBe(400);
    }
  });

  it('decodes a success payload', async () => {
    const decoded = await Effect.runPromise(
      sendCodeToWorker(
        API_BASE,
        'ada@example.com',
        undefined,
        fetcherOf(jsonResponse(200, JSON.stringify({ success: true, message: 'sent' })))
      )
    );
    expect(decoded.message).toBe('sent');
  });

  it('maps a Worker 429 into WorkerApiHttpError', async () => {
    const exit = await Effect.runPromiseExit(
      sendCodeToWorker(
        API_BASE,
        'ada@example.com',
        undefined,
        fetcherOf(jsonResponse(429, JSON.stringify({ error: 'Too many requests' })))
      )
    );
    const error = failedValue(exit);
    expect(error).toBeInstanceOf(WorkerApiHttpError);
    if (error instanceof WorkerApiHttpError) {
      expect(error.status).toBe(429);
      expect(error.message).toBe('Too many requests');
    }
  });
});

describe('verifyCodeWithWorker', () => {
  it('decodes a session payload', async () => {
    const decoded = await Effect.runPromise(
      verifyCodeWithWorker(
        API_BASE,
        'ada@example.com',
        '123456',
        fetcherOf(
          jsonResponse(
            200,
            JSON.stringify({
              success: true,
              token: 'tok_abc',
              expires_at: '2026-01-01T00:00:00.000Z',
              user: { id: 'cust_1', email: 'ada@example.com', name: null },
            })
          )
        )
      )
    );
    expect(decoded.token).toBe('tok_abc');
  });
});

describe('getWorkerDashboard', () => {
  it('maps a 401 without decoding the dashboard schema', async () => {
    const exit = await Effect.runPromiseExit(
      getWorkerDashboard(
        API_BASE,
        null,
        fetcherOf(jsonResponse(401, JSON.stringify({ error: 'Authorization required' })))
      )
    );
    const error = failedValue(exit);
    expect(error).toBeInstanceOf(WorkerApiHttpError);
    if (error instanceof WorkerApiHttpError) {
      expect(error.status).toBe(401);
    }
  });
});
