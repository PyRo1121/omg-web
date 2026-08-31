// Dashboard API handlers (all require authentication)
import * as Schema from 'effect/Schema';
import { type Env, jsonResponse, errorResponse, logAudit } from '../api';
import { Effect, Exit } from 'effect';
import { authenticateSession } from '../admin-auth';
import { decodeJsonBody } from '../body';
import {
  MachineIdBodySchema,
  SessionIdBodySchema,
  UpdateProfileBodySchema,
} from '../contracts/http-bodies';
import {
  decodeExtraRowArray,
  DashboardAuditLogRowSchema,
  IdRowSchema,
  isTeamOrEnterpriseTier,
  isInvalidExtraRow,
  readOptionalExtraRow,
  TierRowSchema,
} from '../contracts/d1-extras';

const SESSION_LIST_LIMIT = 50;
const AUDIT_LOG_LIMIT = 100;

const SessionListRowSchema = Schema.Struct({
  id: Schema.String,
  ip_address: Schema.Union(Schema.Null, Schema.String),
  user_agent: Schema.Union(Schema.Null, Schema.String),
  created_at: Schema.String,
  expires_at: Schema.String,
});

/** Run a handler behind dashboard session validation. */
async function withDashboardSession(
  request: Request,
  env: Env,
  handler: (session: {
    readonly db: D1Database;
    readonly userId: string;
    readonly sessionId: string;
  }) => Response | Promise<Response>
): Promise<Response> {
  const auth = await authenticateSession(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  return handler({ db: env.DB, userId: auth.user.id, sessionId: auth.session.id });
}

/** Load the authenticated customer's license ID or its HTTP failure. */
async function loadLicenseId(db: D1Database, userId: string): Promise<string | Response> {
  const lookup = await readOptionalExtraRow(
    IdRowSchema,
    'License id row has an invalid shape',
    await db.prepare(`SELECT id FROM licenses WHERE customer_id = ?`).bind(userId).first()
  );
  if (isInvalidExtraRow(lookup)) {
    return errorResponse('Failed to load license', 500);
  }
  return lookup._tag === 'missing' ? errorResponse('License not found', 404) : lookup.value.id;
}

// Update user profile
export async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, async ({ db, userId }) => {
    const decoded = await Effect.runPromiseExit(decodeJsonBody(request, UpdateProfileBodySchema));
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    if (decoded.value.company !== undefined) {
      await db
        .prepare(`UPDATE customers SET company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(decoded.value.company || null, userId)
        .run();
    }
    await Effect.runPromise(
      logAudit(db, userId, 'user.profile_updated', 'customer', userId, request)
    );
    return jsonResponse({ success: true });
  });
}

// Regenerate license key
export async function handleRegenerateLicense(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, async ({ db, userId }) => {
    const licenseId = await loadLicenseId(db, userId);
    if (licenseId instanceof Response) {
      return licenseId;
    }

    const newLicenseKey = crypto.randomUUID();
    // One round trip: rotate the key and deactivate every machine atomically.
    await db.batch([
      db
        .prepare(`UPDATE licenses SET license_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(newLicenseKey, licenseId),
      db.prepare(`UPDATE machines SET is_active = 0 WHERE license_id = ?`).bind(licenseId),
    ]);
    await Effect.runPromise(
      logAudit(db, userId, 'license.regenerated', 'license', licenseId, request)
    );

    return jsonResponse({
      success: true,
      license_key: newLicenseKey,
      message: 'License key regenerated. All machines need to re-activate.',
    });
  });
}

// Revoke a machine (by machine_id) or a team member's machine (by row id).
async function deactivateMachine(
  db: D1Database,
  userId: string,
  request: Request,
  machineId: string,
  whereColumn: 'machine_id' | 'id',
  auditAction: string
): Promise<Response> {
  const licenseId = await loadLicenseId(db, userId);
  if (licenseId instanceof Response) {
    return licenseId;
  }

  const changed = await db
    .prepare(
      `UPDATE machines SET is_active = 0
       WHERE license_id = ? AND ${whereColumn} = ?
       RETURNING id`
    )
    .bind(licenseId, machineId)
    .first();

  if (changed === null) {
    return errorResponse('Machine not found', 404);
  }

  await Effect.runPromise(logAudit(db, userId, auditAction, 'machine', machineId, request));

  return jsonResponse({ success: true });
}

// Revoke a machine
export async function handleRevokeMachine(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, async ({ db, userId }) => {
    const decoded = await Effect.runPromiseExit(decodeJsonBody(request, MachineIdBodySchema));
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    return deactivateMachine(
      db,
      userId,
      request,
      decoded.value.machine_id,
      'machine_id',
      'machine.revoked'
    );
  });
}

// Get active sessions
export async function handleGetSessions(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, async ({ db, userId, sessionId }) => {
    const sessions = await db
      .prepare(
        `
      SELECT id, ip_address, user_agent, created_at, expires_at
      FROM sessions
      WHERE customer_id = ? AND expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .bind(userId, SESSION_LIST_LIMIT)
      .all();

    const decoded = Schema.decodeUnknownEither(Schema.Array(SessionListRowSchema))(
      sessions.results === undefined ? [] : sessions.results
    );
    if (decoded._tag === 'Left') {
      return errorResponse('Internal server error', 500);
    }

    return jsonResponse({
      sessions: decoded.right.map(session => ({
        ...session,
        is_current: session.id === sessionId,
      })),
    });
  });
}

// Revoke a session
export async function handleRevokeSession(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, async ({ db, userId, sessionId }) => {
    const decoded = await Effect.runPromiseExit(decodeJsonBody(request, SessionIdBodySchema));
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    const body = decoded.value;

    // Can't revoke current session via this endpoint
    if (body.session_id === sessionId) {
      return errorResponse('Cannot revoke current session. Use logout instead.', 400);
    }

    const revoked = await db
      .prepare(
        `DELETE FROM sessions WHERE id = ? AND customer_id = ?
         RETURNING id`
      )
      .bind(body.session_id, userId)
      .first();

    if (revoked === null) {
      return errorResponse('Session not found', 404);
    }

    await Effect.runPromise(
      logAudit(db, userId, 'session.revoked', 'session', body.session_id, request)
    );

    return jsonResponse({ success: true });
  });
}

// Get audit log
export async function handleGetAuditLog(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, async ({ db, userId }) => {
    // Only team+ tiers can access audit logs
    const licenseRow = await db
      .prepare(`SELECT tier FROM licenses WHERE customer_id = ?`)
      .bind(userId)
      .first();

    const licenseLookup = await readOptionalExtraRow(
      TierRowSchema,
      'License tier row has an invalid shape',
      licenseRow
    );
    if (licenseLookup._tag === 'invalid') {
      return errorResponse('Failed to load license', 500);
    }
    if (licenseLookup._tag === 'missing' || !isTeamOrEnterpriseTier(licenseLookup.value.tier)) {
      return errorResponse('Audit logs require Team or Enterprise tier', 403);
    }

    const logs = await db
      .prepare(
        `
      SELECT id, action, resource_type, resource_id, ip_address, created_at
      FROM audit_log
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .bind(userId, AUDIT_LOG_LIMIT)
      .all();
    const decodedLogs = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DashboardAuditLogRowSchema,
        'Dashboard audit log rows have an invalid shape',
        logs.results
      )
    );
    if (Exit.isFailure(decodedLogs)) {
      return errorResponse('Failed to load audit logs', 500);
    }

    return jsonResponse({ logs: decodedLogs.value });
  });
}
