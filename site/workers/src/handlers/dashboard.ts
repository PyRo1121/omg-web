// Dashboard API handlers (all require authentication)
import { Schema } from '@effect/schema';
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
  MemberRecentUsageRowSchema,
  MemberUsageRowSchema,
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

// Update user profile
export async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Authorization required', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid or expired session', 401);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, UpdateProfileBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const body = decoded.value;
  const { user } = auth;

  if (body.name !== undefined) {
    await env.DB.prepare(
      `
      UPDATE customers SET company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `
    )
      .bind(body.name || null, user.id)
      .run();
  }

  await logAudit(env.DB, user.id, 'user.profile_updated', 'customer', user.id, request);

  return jsonResponse({ success: true });
}

// Regenerate license key
export async function handleRegenerateLicense(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Authorization required', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid or expired session', 401);
  }

  const { user } = auth;

  // Get current license
  const licenseRow = await env.DB.prepare(
    `
    SELECT id FROM licenses WHERE customer_id = ?
  `
  )
    .bind(user.id)
    .first();

  const licenseLookup = await readOptionalExtraRow(
    IdRowSchema,
    'License id row has an invalid shape',
    licenseRow
  );
  if (isInvalidExtraRow(licenseLookup)) {
    return errorResponse('Failed to load license', 500);
  }
  if (licenseLookup._tag === 'missing') {
    return errorResponse('License not found', 404);
  }
  const license = licenseLookup.value;

  // Generate new key
  const newLicenseKey = crypto.randomUUID();

  await env.DB.prepare(
    `
    UPDATE licenses SET license_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `
  )
    .bind(newLicenseKey, license.id)
    .run();

  // Deactivate all machines (they need to re-activate)
  await env.DB.prepare(
    `
    UPDATE machines SET is_active = 0 WHERE license_id = ?
  `
  )
    .bind(license.id)
    .run();

  await logAudit(env.DB, user.id, 'license.regenerated', 'license', license.id, request);

  return jsonResponse({
    success: true,
    license_key: newLicenseKey,
    message: 'License key regenerated. All machines need to re-activate.',
  });
}

// Revoke a machine
export async function handleRevokeMachine(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Authorization required', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid or expired session', 401);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, MachineIdBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const body = decoded.value;
  const { user } = auth;

  // Get license
  const licenseRow = await env.DB.prepare(
    `
    SELECT id FROM licenses WHERE customer_id = ?
  `
  )
    .bind(user.id)
    .first();

  const licenseLookup = await readOptionalExtraRow(
    IdRowSchema,
    'License id row has an invalid shape',
    licenseRow
  );
  if (isInvalidExtraRow(licenseLookup)) {
    return errorResponse('Failed to load license', 500);
  }
  if (licenseLookup._tag === 'missing') {
    return errorResponse('License not found', 404);
  }
  const license = licenseLookup.value;

  // Deactivate machine
  const result = await env.DB.prepare(
    `
    UPDATE machines SET is_active = 0 WHERE license_id = ? AND machine_id = ?
  `
  )
    .bind(license.id, body.machine_id)
    .run();

  if (result.meta.changes === 0) {
    return errorResponse('Machine not found', 404);
  }

  await logAudit(env.DB, user.id, 'machine.revoked', 'machine', body.machine_id, request);

  return jsonResponse({ success: true });
}

// Get active sessions
export async function handleGetSessions(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Authorization required', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid or expired session', 401);
  }

  const sessions = await env.DB.prepare(
    `
    SELECT id, ip_address, user_agent, created_at, expires_at
    FROM sessions
    WHERE customer_id = ? AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `
  )
    .bind(auth.user.id)
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
      is_current: session.id === auth.session.id,
    })),
  });
}

// Revoke a session
export async function handleRevokeSession(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Authorization required', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid or expired session', 401);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, SessionIdBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const body = decoded.value;

  // Can't revoke current session via this endpoint
  if (body.session_id === auth.session.id) {
    return errorResponse('Cannot revoke current session. Use logout instead.');
  }

  await env.DB.prepare(
    `
    DELETE FROM sessions WHERE id = ? AND customer_id = ?
  `
  )
    .bind(body.session_id, auth.user.id)
    .run();

  await logAudit(env.DB, auth.user.id, 'session.revoked', 'session', body.session_id, request);

  return jsonResponse({ success: true });
}

// Get team members and their usage (for Team/Enterprise tiers)
export async function handleGetTeamMembers(request: Request, env: Env): Promise<Response> {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return errorResponse('Authorization required', 401);
    }

    const auth = await validateSession(env.DB, token);
    if (!auth) {
      return errorResponse('Invalid or expired session', 401);
    }

    // Get license and check tier
    const licenseRow = await env.DB.prepare(
      `
      SELECT id, tier, status, max_seats FROM licenses WHERE customer_id = ?
    `
    )
      .bind(auth.user.id)
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
    const machinesResult = await env.DB.prepare(
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

    // Get real per-member usage stats
    const memberUsageResult = await env.DB.prepare(
      `
    SELECT
      machine_id,
      SUM(commands_run) as total_commands,
      SUM(packages_installed) as total_packages,
      SUM(time_saved_ms) as total_time_saved_ms,
      MAX(date) as last_active
    FROM usage_member_daily
    WHERE license_id = ?
    GROUP BY machine_id
  `
    )
      .bind(license.id)
      .all();

    const memberUsageExit = await Effect.runPromiseExit(
      decodeExtraRowArray(
        MemberUsageRowSchema,
        'Member usage rows have an invalid shape',
        memberUsageResult.results
      )
    );
    if (Exit.isFailure(memberUsageExit)) {
      return errorResponse('Failed to load team members', 500);
    }

    const usageMap = new Map(memberUsageExit.value.map(row => [row.machine_id, row]));

    // Get last 7 days usage
    const recentUsageResult = await env.DB.prepare(
      `
    SELECT
      machine_id,
      SUM(commands_run) as commands_last_7d
    FROM usage_member_daily
    WHERE license_id = ? AND date >= date('now', '-7 days')
    GROUP BY machine_id
  `
    )
      .bind(license.id)
      .all();

    const recentUsageExit = await Effect.runPromiseExit(
      decodeExtraRowArray(
        MemberRecentUsageRowSchema,
        'Recent member usage rows have an invalid shape',
        recentUsageResult.results
      )
    );
    if (Exit.isFailure(recentUsageExit)) {
      return errorResponse('Failed to load team members', 500);
    }

    const recentMap = new Map(
      recentUsageExit.value.map(row => [row.machine_id, row.commands_last_7d])
    );

    const totalUsageRow = await env.DB.prepare(
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
      const recent = recentMap.get(member.machine_id) ?? 0;
      return {
        ...member,
        total_commands: usage?.total_commands ?? 0,
        total_packages: usage?.total_packages ?? 0,
        total_time_saved_ms: usage?.total_time_saved_ms ?? 0,
        commands_last_7d: recent,
        last_active: usage?.last_active ?? member.last_seen_at,
      };
    });

    // Calculate fleet compliance (version drift)
    const versions = machines.map(member => member.omg_version || 'unknown');
    const uniqueVersions = [...new Set(versions)];
    const latestVersion = uniqueVersions.toSorted().toReversed()[0] || 'unknown';
    const complianceRate =
      (versions.filter(v => v === latestVersion).length / (versions.length || 1)) * 100;

    // Calculate ROI (Return on Investment)
    const totalHoursSaved = (totalUsage?.total_time_saved_ms ?? 0) / (1000 * 60 * 60);
    const totalValueUSD = Math.round(totalHoursSaved * 100);

    // Get daily usage breakdown (last 14 days)
    const dailyUsage = await env.DB.prepare(
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
    console.error('handleGetTeamMembers error:', error);
    return errorResponse('Failed to load team data', 500);
  }
}

// Revoke a team member's machine access
export async function handleRevokeTeamMember(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Authorization required', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid or expired session', 401);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, MachineIdBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const body = decoded.value;

  // Get license
  const licenseRow = await env.DB.prepare(
    `
    SELECT id FROM licenses WHERE customer_id = ?
  `
  )
    .bind(auth.user.id)
    .first();

  const licenseLookup = await readOptionalExtraRow(
    IdRowSchema,
    'License id row has an invalid shape',
    licenseRow
  );
  if (isInvalidExtraRow(licenseLookup)) {
    return errorResponse('Failed to load license', 500);
  }
  if (licenseLookup._tag === 'missing') {
    return errorResponse('License not found', 404);
  }
  const license = licenseLookup.value;

  // Deactivate the machine
  const result = await env.DB.prepare(
    `
    UPDATE machines SET is_active = 0 WHERE license_id = ? AND id = ?
  `
  )
    .bind(license.id, body.machine_id)
    .run();

  if (result.meta.changes === 0) {
    return errorResponse('Machine not found', 404);
  }

  await logAudit(env.DB, auth.user.id, 'team.member_revoked', 'machine', body.machine_id, request);

  return jsonResponse({ success: true });
}

// Get audit log
export async function handleGetAuditLog(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Authorization required', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid or expired session', 401);
  }

  // Only team+ tiers can access audit logs
  const licenseRow = await env.DB.prepare(
    `
    SELECT tier FROM licenses WHERE customer_id = ?
  `
  )
    .bind(auth.user.id)
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

  const logs = await env.DB.prepare(
    `
    SELECT id, action, resource_type, resource_id, ip_address, created_at
    FROM audit_log
    WHERE customer_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `
  )
    .bind(auth.user.id)
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
}

// Placeholder for policies
export async function handleGetTeamPolicies(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Unauthorized', 401);
  }
  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid session', 401);
  }

  // Return empty list for now (Production-ready placeholder)
  return jsonResponse({ policies: [] });
}

// Placeholder for notifications
export async function handleGetNotifications(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Unauthorized', 401);
  }
  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid session', 401);
  }

  return jsonResponse({ settings: [] });
}
