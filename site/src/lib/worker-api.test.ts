import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import { requestDecodedJson, WorkerApiNetworkError, type WorkerFetcher } from './worker-api';

const SuccessSchema = Schema.Struct({ success: Schema.Literal(true) });

function fetcherWith(response: Response): WorkerFetcher {
  return {
    fetch() {
      return Effect.succeed(response);
    },
  };
}

describe('requestDecodedJson', () => {
  it('decodes a successful JSON response', async () => {
    const result = await Effect.runPromise(
      requestDecodedJson(
        fetcherWith(Response.json({ success: true })),
        '/api/licensing/api/dashboard',
        { method: 'GET' },
        SuccessSchema,
        'Invalid response'
      )
    );

    expect(result).toEqual({ success: true });
  });

  it('returns a typed HTTP failure for a rejected response', async () => {
    const exit = await Effect.runPromiseExit(
      requestDecodedJson(
        fetcherWith(Response.json({ error: 'Forbidden' }, { status: 403 })),
        '/api/licensing/api/admin/users',
        { method: 'GET' },
        SuccessSchema,
        'Invalid response'
      )
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('returns a typed parse failure for an invalid success payload', async () => {
    const exit = await Effect.runPromiseExit(
      requestDecodedJson(
        fetcherWith(Response.json({ success: false })),
        '/api/licensing/api/dashboard',
        { method: 'GET' },
        SuccessSchema,
        'Invalid response'
      )
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('WorkerApiNetworkError', () => {
  it('retains the network cause', () => {
    const cause = new Error('offline');
    expect(new WorkerApiNetworkError(cause).cause).toBe(cause);
  });
});
