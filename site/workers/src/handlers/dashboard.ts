import { reportError } from '../observability';
// Dashboard API handlers (all require authentication)
import * as Schema from 'effect/Schema';
import {
  type Env,
  jsonResponse,
  errorResponse,
  validateSession,
  getAuthToken,
  logAudit,
} from '../api';
import { Effect, Exit } from 'effect';
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
  LicenseTeamAuthRowSchema,
  optionalRowValue,
  isInvalidExtraRow,
  readOptionalExtraRow,
  TeamMemberMachineRowSchema,
  TeamUsageTotalsRowSchema,
  TierRowSchema,
  UsageDailyRowSchema,
} from '../contracts/d1-extras';

const SessionListRowSchema = Schema.Struct({
  id: Schema.String,
  ip_address: Schema.Union(Schema.Null, Schema.String),
  user_agent: Schema.Union(Schema.Null, Schema.String),
  created_at: Schema.String,
  expires_at: Schema.String,
});

/** Lifetime per-machine usage totals with a trailing-7-day command column, decoded from one query. */
const MemberUsageWithRecentRowSchema = Schema.Struct({
  machine_id: Schema.String,
  total_commands: Schema.Union(Schema.Null, Schema.Number),
  total_packages: Schema.Union(Schema.Null, Schema.Number),
  total_time_saved_ms: Schema.Union(Schema.Null, Schema.Number),
  last_active: Schema.Union(Schema.Null, Schema.String),
  commands_last_7d: Schema.Union(Schema.Null, Schema.Number),
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
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Authorization required', 401);
  }
  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid or expired session', 401);
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
    if (decoded.value.name !== undefined) {
      await db
        .prepare(`UPDATE customers SET company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(decoded.value.name || null, userId)
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

  const result = await db
    .prepare(`UPDATE machines SET is_active = 0 WHERE license_id = ? AND ${whereColumn} = ?`)
    .bind(licenseId, machineId)
    .run();

  if (result.meta.changes === 0) {
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
    `
      )
      .bind(userId)
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
      return errorResponse('Cannot revoke current session. Use logout instead.');
    }

    await db
      .prepare(`DELETE FROM sessions WHERE id = ? AND customer_id = ?`)
      .bind(body.session_id, userId)
      .run();

    await Effect.runPromise(
      logAudit(db, userId, 'session.revoked', 'session', body.session_id, request)
    );

    return jsonResponse({ success: true });
  });
}

// Get team members and their usage (for Team/Enterprise tiers)
export async function handleGetTeamMembers(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, async ({ db, userId }) => {
    try {
      // Get license and check tier
      const licenseRow = await db
        .prepare(
          `
      SELECT id, tier, status, max_seats FROM licenses WHERE customer_id = ?
    `
        )
        .bind(userId)
        .first();

      const licenseLookup = await readOptionalExtraRow(
        LicenseTeamAuthRowSchema,
        'Team license row has an invalid shape',
        licenseRow
      );
      if (isInvalidExtraRow(licenseLookup)) {
        return errorResponse('Failed to load license', 500);
      }
      if (licenseLookup._tag === 'missing') {
        return errorResponse('License not found', 404);
      }
      const license = licenseLookup.value;

      if (!isTeamOrEnterpriseTier(license.tier)) {
        return errorResponse('Team management requires Team or Enterprise tier', 403);
      }

      // Get all machines (team members)
      const machinesResult = await db
        .prepare(
          `
    SELECT
      m.id,
      m.machine_id,
      m.hostname,
      m.os,
      m.arch,
      m.omg_version,
      m.user_name,
      m.user_email,
      m.is_active,
      m.first_seen_at,
      m.last_seen_at
    FROM machines m
    WHERE m.license_id = ?
    ORDER BY m.last_seen_at DESC
  `
        )
        .bind(license.id)
        .all();

      const machinesExit = await Effect.runPromiseExit(
        decodeExtraRowArray(
          TeamMemberMachineRowSchema,
          'Team member machine rows have an invalid shape',
          machinesResult.results
        )
      );
      if (Exit.isFailure(machinesExit)) {
        return errorResponse('Failed to load team members', 500);
      }
      const machines = machinesExit.value;

      // Get real per-member usage stats: lifetime totals and trailing-7-day
      // commands decoded from a single query (one D1 round trip instead of two).
      const memberUsageResult = await db
        .prepare(
          `
    SELECT
      machine_id,
      SUM(commands_run) as total_commands,
      SUM(packages_installed) as total_packages,
      SUM(time_saved_ms) as total_time_saved_ms,
      MAX(date) as last_active,
      SUM(CASE WHEN date >= date('now', '-7 days') THEN commands_run ELSE 0 END) as commands_last_7d
    FROM usage_member_daily
    WHERE license_id = ?
    GROUP BY machine_id
  `
        )
        .bind(license.id)
        .all();

      const memberUsageExit = await Effect.runPromiseExit(
        decodeExtraRowArray(
          MemberUsageWithRecentRowSchema,
          'Member usage rows have an invalid shape',
          memberUsageResult.results
        )
      );
      if (Exit.isFailure(memberUsageExit)) {
        return errorResponse('Failed to load team members', 500);
      }

      const usageMap = new Map(memberUsageExit.value.map(row => [row.machine_id, row]));

      const totalUsageRow = await db
        .prepare(
          `
    SELECT
      SUM(commands_run) as total_commands,
      SUM(packages_installed) as total_packages,
      SUM(time_saved_ms) as total_time_saved_ms
    FROM usage_daily
    WHERE license_id = ?
  `
        )
        .bind(license.id)
        .first();

      const totalUsageLookup = await readOptionalExtraRow(
        TeamUsageTotalsRowSchema,
        'Team usage totals have an invalid shape',
        totalUsageRow
      );
      if (isInvalidExtraRow(totalUsageLookup)) {
        return errorResponse('Failed to load team members', 500);
      }
      const totalUsage = optionalRowValue(totalUsageLookup);

      const membersWithUsage = machines.map(member => {
        const usage = usageMap.get(member.machine_id);
        return {
          ...member,
          total_commands: usage?.total_commands ?? 0,
          total_packages: usage?.total_packages ?? 0,
          total_time_saved_ms: usage?.total_time_saved_ms ?? 0,
          commands_last_7d: usage?.commands_last_7d ?? 0,
          last_active: usage?.last_active ?? member.last_seen_at,
        };
      });

      // Calculate fleet compliance (version drift)
      const versions = machines.map(member => member.omg_version || 'unknown');
      const uniqueVersions = [...new Set(versions)];
      const latestVersion =
        uniqueVersions.toSorted((left, right) =>
          right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' })
        )[0] ?? 'unknown';
      const complianceRate =
        (versions.filter(v => v === latestVersion).length / (versions.length || 1)) * 100;

      // Calculate ROI (Return on Investment)
      const totalHoursSaved = (totalUsage?.total_time_saved_ms ?? 0) / (1000 * 60 * 60);
      const totalValueUSD = Math.round(totalHoursSaved * 100);

      // Get daily usage breakdown (last 14 days)
      const dailyUsage = await db
        .prepare(
          `
    SELECT
      date,
      commands_run,
      time_saved_ms
    FROM usage_daily
    WHERE license_id = ? AND date >= date('now', '-14 days')
    ORDER BY date DESC
  `
        )
        .bind(license.id)
        .all();
      const dailyUsageExit = await Effect.runPromiseExit(
        decodeExtraRowArray(
          UsageDailyRowSchema,
          'Team daily usage rows have an invalid shape',
          dailyUsage.results
        )
      );
      if (Exit.isFailure(dailyUsageExit)) {
        return errorResponse('Failed to load team data', 500);
      }

      // Get team totals
      const totalMachines = machines.length;
      const activeMachines = machines.filter(member => member.is_active === 1).length;
      const totalCommands = totalUsage?.total_commands ?? 0;
      const totalTimeSaved = totalUsage?.total_time_saved_ms ?? 0;

      return jsonResponse({
        license: {
          tier: license.tier,
          max_seats: license.max_seats,
          status: license.status,
        },
        members: membersWithUsage,
        daily_usage: dailyUsageExit.value,
        totals: {
          total_machines: totalMachines,
          active_machines: activeMachines,
          total_commands: totalCommands,
          total_time_saved_ms: totalTimeSaved,
          total_time_saved_hours: Math.round((totalTimeSaved / (1000 * 60 * 60)) * 10) / 10,
          total_value_usd: totalValueUSD,
        },
        fleet_health: {
          compliance_rate: Math.round(complianceRate),
          latest_version: latestVersion,
          version_drift: uniqueVersions.length > 1,
        },
        productivity_score: Math.min(100, Math.round((totalCommands / 1000) * 100)),
        insights: {
          engagement_rate: Math.round((activeMachines / (totalMachines || 1)) * 100),
          roi_multiplier: totalValueUSD > 0 ? (totalValueUSD / 200).toFixed(1) : '0',
        },
      });
    } catch (error: unknown) {
      reportError('handleGetTeamMembers error:', error);
      return errorResponse('Failed to load team data', 500);
    }
  });
}

// Revoke a team member's machine access
export async function handleRevokeTeamMember(request: Request, env: Env): Promise<Response> {
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
      'id',
      'team.member_revoked'
    );
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
      LIMIT 100
    `
      )
      .bind(userId)
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

// Placeholder for policies
export async function handleGetTeamPolicies(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, () => jsonResponse({ policies: [] }));
}

// Placeholder for notifications
export async function handleGetNotifications(request: Request, env: Env): Promise<Response> {
  return withDashboardSession(request, env, () => jsonResponse({ settings: [] }));
}
