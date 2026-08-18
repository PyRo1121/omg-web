import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decodeStripeJson,
  StripeBalanceSchema,
  StripeCheckoutSessionSchema,
  StripeCustomerListSchema,
} from '../src/contracts/stripe';
import { CreatePolicyBodySchema, decodeStoredStringArray } from '../src/contracts/team-controls';
import { SingleTelemetryRequestSchema } from '../src/contracts/cli-telemetry';
import { decodeJsonBody } from '../src/body';
import { MachineIdBodySchema, TrackingBatchSchema } from '../src/contracts/http-bodies';
import { decodeExtraRowArray, FirehoseEventRowSchema } from '../src/contracts/d1-extras';

function isSuccess<A, E>(exit: Exit.Exit<A, E>): boolean {
  return Exit.isSuccess(exit);
}

describe('Stripe JSON decode', () => {
  it('decodes a checkout session', async () => {
    const exit = await Effect.runPromiseExit(
      decodeStripeJson(StripeCheckoutSessionSchema, 'checkout', {
        id: 'cs_1',
        url: 'https://checkout.stripe.com/c/pay/cs_1',
      })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a customer list without data', async () => {
    const exit = await Effect.runPromiseExit(
      decodeStripeJson(StripeCustomerListSchema, 'customers', { has_more: false })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('sums typed balance amounts', async () => {
    const exit = await Effect.runPromiseExit(
      decodeStripeJson(StripeBalanceSchema, 'balance', {
        available: [{ amount: 100 }],
        pending: [{ amount: 25 }],
      })
    );
    expect(isSuccess(exit)).toBe(true);
    if (exit._tag !== 'Success') {
      return;
    }
    const available = exit.value.available.reduce((sum, funds) => sum + funds.amount, 0);
    expect(available).toBe(100);
  });
});

describe('team-controls JSON decode', () => {
  it('decodes a create-policy body', async () => {
    const request = new Request('https://api.pyro1121.com/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'runtime',
        rule: 'allow',
        value: 'node',
        enforced: true,
      }),
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, CreatePolicyBodySchema));
    expect(isSuccess(exit)).toBe(true);
  });

  it('falls back when stored channels JSON is corrupt', () => {
    expect(decodeStoredStringArray('{', ['email'])).toEqual(['email']);
  });
});

describe('CLI telemetry JSON decode', () => {
  it('decodes a command event', async () => {
    const request = new Request('https://api.pyro1121.com/api/cli/event', {
      method: 'POST',
      body: JSON.stringify({
        event: { type: 'command', command: 'search', success: true, subcommand: null },
        timestamp: '2026-08-17T00:00:00.000Z',
        machine_id: 'm1',
        version: '0.1.0',
        platform: 'linux',
        license_key: 'lic-1',
      }),
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, SingleTelemetryRequestSchema));
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a non-object event envelope', async () => {
    const request = new Request('https://api.pyro1121.com/api/cli/event', {
      method: 'POST',
      body: 'not-json',
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, SingleTelemetryRequestSchema));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('remaining HTTP bodies', () => {
  it('requires a machine_id', async () => {
    const request = new Request('https://api.pyro1121.com/api/machines/revoke', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, MachineIdBodySchema));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('decodes a tracking batch', async () => {
    const request = new Request('https://api.pyro1121.com/api/track', {
      method: 'POST',
      body: JSON.stringify({
        events: [
          {
            event_type: 'pageview',
            event_name: 'view',
            session_id: 's1',
            properties: { path: '/', referrer: 'https://example.com' },
          },
        ],
      }),
    });
    const exit = await Effect.runPromiseExit(decodeJsonBody(request, TrackingBatchSchema));
    expect(isSuccess(exit)).toBe(true);
  });
});

describe('firehose rows', () => {
  it('decodes analytics event rows', async () => {
    const exit = await Effect.runPromiseExit(
      decodeExtraRowArray(FirehoseEventRowSchema, 'firehose', [
        {
          id: 'e1',
          event_type: 'command',
          event_name: 'search',
          properties: '{"ok":true}',
          timestamp: '2026-08-17T00:00:00.000Z',
          session_id: 's1',
          machine_id: 'm1',
          version: '0.1.0',
          platform: 'linux',
          duration_ms: 10,
          created_at: '2026-08-17T00:00:00.000Z',
        },
      ])
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a non-array results value', async () => {
    const exit = await Effect.runPromiseExit(
      decodeExtraRowArray(FirehoseEventRowSchema, 'firehose', { nope: true })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
