/**
 * P10-011 PoC. NOT part of the project test suite.
 * Find-or-create customer race: two concurrent POST /api/auth/verify-code
 * requests for one identity both observe "missing" and both INSERT,
 * producing duplicate `customers` rows (no UNIQUE on customers.email).
 * Runs against the real worker in workerd with the real migration schema.
 */
import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';
import { hashOtpCode } from '../src/otp';

const JWT_SECRET = 'p10-011-poc-jwt-secret';

function req(path: string, body?: string): Request {
  return new Request(`https://omg-api.latham.cloud${path}`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body,
  });
}

async function dispatch(request: Request): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(request, env, context);
  await waitOnExecutionContext(context);
  return response;
}

interface VerifyResponse {
  success: boolean;
  token?: string;
  user?: { id: string; email: string };
  error?: string;
}

describe('P10-011 find-or-create duplicate race', () => {
  beforeAll(() => {
    (env as Record<string, unknown>).TURNSTILE_SECRET_KEY = undefined;
    (env as Record<string, unknown>).JWT_SECRET = JWT_SECRET;
  });

  it('two concurrent verify-code calls create two customer rows for one identity', async () => {
    let duplicatedRound = -1;
    let dupCustomerIds: string[] = [];
    let dupSessionCustomerIds: string[] = [];

    for (let round = 0; round < 5 && duplicatedRound === -1; round++) {
      const email = `p10-011-race-${round}@race.test`;
      const codes = ['135791', '246802'];

      // Seed two independently-claimable OTPs for this identity
      // (attacker gets these from two legitimate send-code emails; limit is 3/min).
      for (const code of codes) {
        const digest = await hashOtpCode(email, code, JWT_SECRET);
        await env.DB.prepare(
          `INSERT INTO auth_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          email,
          digest,
          new Date(Date.now() + 10 * 60 * 1000).toISOString()
        ).run();
      }

      // Double-submit: two concurrent verifications of the same identity.
      const [resA, resB] = await Promise.all([
        dispatch(req('/api/auth/verify-code', JSON.stringify({ email, code: codes[0] }))),
        dispatch(req('/api/auth/verify-code', JSON.stringify({ email, code: codes[1] }))),
      ]);
      const jsonA = (await resA.json()) as VerifyResponse;
      const jsonB = (await resB.json()) as VerifyResponse;

      const rows = await env.DB.prepare(
        `SELECT id FROM customers WHERE email = ? ORDER BY id`
      ).bind(email).all<{ id: string }>();
      const customerIds = rows.results.map(r => r.id);

      const sessionRows =
        customerIds.length > 0
          ? await env.DB.prepare(
              `SELECT DISTINCT customer_id FROM sessions WHERE customer_id IN (${customerIds.map(() => '?').join(',')})`
            ).bind(...customerIds).all<{ customer_id: string }>()
          : { results: [] };
      const sessionCustomerIds = sessionRows.results.map(r => r.customer_id).sort();

      console.log(
        `P10_011 round=${round} statusA=${resA.status} statusB=${resB.status} ` +
          `okA=${jsonA.success} okB=${jsonB.success} ` +
          `customerRows=${customerIds.length} customerIds=${JSON.stringify(customerIds)} ` +
          `sessionCustomerIds=${JSON.stringify(sessionCustomerIds)}`
      );

      if (customerIds.length > 1) {
        duplicatedRound = round;
        dupCustomerIds = customerIds;
        dupSessionCustomerIds = sessionCustomerIds;
        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);
        expect(jsonA.token).toBeTruthy();
        expect(jsonB.token).toBeTruthy();
        // Identity fragmentation: the two concurrent sessions of ONE user
        // are bound to TWO different customer ids.
        expect(sessionCustomerIds.length).toBe(2);
      }
    }

    if (duplicatedRound === -1) {
      console.log('P10_011_RESULT not_reproduced');
      expect.unreachable('race not reproduced in any round');
      return;
    }
    console.log(
      `P10_011_RESULT reproduced round=${duplicatedRound} ` +
        `duplicate_customer_ids=${JSON.stringify(dupCustomerIds)} ` +
        `session_customer_fragments=${JSON.stringify(dupSessionCustomerIds)}`
    );
    expect(dupCustomerIds.length).toBe(2);
  });
});
