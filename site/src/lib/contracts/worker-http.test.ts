import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { AdminOverviewSchema, decodeWorkerHttp, SuccessSchema } from './worker-http';

describe('decodeWorkerHttp', () => {
  it('decodes a success acknowledgement', async () => {
    const decoded = await Effect.runPromise(
      decodeWorkerHttp(SuccessSchema, 'invalid success payload', { success: true })
    );
    expect(decoded.success).toBe(true);
  });

  it('defaults a missing admin overview total_commands field to 0', async () => {
    const decoded = await Effect.runPromise(
      decodeWorkerHttp(AdminOverviewSchema, 'invalid admin overview', {
        overview: {
          total_users: 4,
          command_health: { success: 10, failure: 1 },
        },
        fleet: {},
        usage: {},
      })
    );
    expect(decoded.overview.total_users).toBe(4);
    expect(decoded.overview.total_commands).toBe(0);
    expect(decoded.overview.command_health.success).toBe(10);
  });
});
