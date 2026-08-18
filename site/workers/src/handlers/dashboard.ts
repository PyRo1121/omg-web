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

  let body: { name?: string };
  try {
    // SAFETY: The request boundary is restricted to the documented profile field.
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
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
  const license = await env.DB.prepare(
    `
    SELECT id FROM licenses WHERE customer_id = ?
  `
  )
    .bind(user.id)
    .first();

  if (!license) {
    return errorResponse('License not found', 404);
  }

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

  // SAFETY: The license row is loaded from the database and has a string primary key.
  await logAudit(env.DB, user.id, 'license.regenerated', 'license', String(license.id), request);

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

  let body: { machine_id?: string };
  try {
    // SAFETY: The request boundary is restricted to the documented machine field.
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
  const { user } = auth;

  if (!body.machine_id) {
    return errorResponse('Machine ID required');
  }

  // Get license
  const license = await env.DB.prepare(
    `
    SELECT id FROM licenses WHERE customer_id = ?
  `
  )
    .bind(user.id)
    .first();

  if (!license) {
    return errorResponse('License not found', 404);
  }

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

  let body: { session_id?: string };
  try {
    // SAFETY: The request boundary is restricted to the documented session field.
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.session_id) {
    return errorResponse('Session ID required');
  }

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
    const license = await env.DB.prepare(
      `
      SELECT id, tier, status, max_seats FROM licenses WHERE customer_id = ?
    `
    )
      .bind(auth.user.id)
      .first();

    if (!license) {
      return errorResponse('License not found', 404);
    }

    // SAFETY: License tier is a string value from the licenses schema.
    if (license.tier !== 'team' && license.tier !== 'enterprise') {
      return errorResponse('Team management requires Team or Enterprise tier', 403);
    }

    // Get all machines (team members)
    const machines = await env.DB.prepare(
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

    // Get real per-member usage stats
    const memberUsage = await env.DB.prepare(
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

    const usageMap = new Map(memberUsage.results?.map(u => [u.machine_id, u]) || []);

    // Get last 7 days usage
    const recentUsage = await env.DB.prepare(
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

    const recentMap = new Map(
      recentUsage.results?.map(u => [u.machine_id, u.commands_last_7d]) || []
    );

    const totalUsage = await env.DB.prepare(
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

    const membersWithUsage = (machines.results || []).map(m => {
      // SAFETY: Machine ids are string keys selected by both usage queries.
      const usage = usageMap.get(m.machine_id) || {};
      const recent = recentMap.get(m.machine_id) || 0;
      return {
        ...m,
        total_commands: Number(usage.total_commands || 0),
        total_packages: Number(usage.total_packages || 0),
        total_time_saved_ms: Number(usage.total_time_saved_ms || 0),
        commands_last_7d: Number(recent),
        last_active: usage.last_active || m.last_seen_at,
      };
    });

    // Calculate fleet compliance (version drift)
    const versions = (machines.results || []).map(m => m.omg_version || 'unknown');
    const uniqueVersions = [...new Set(versions)];
    const latestVersion = uniqueVersions.toSorted().toReversed()[0] || 'unknown';
    const complianceRate =
      (versions.filter(v => v === latestVersion).length / (versions.length || 1)) * 100;

    // Calculate ROI (Return on Investment)
    const totalHoursSaved = (Number(totalUsage?.total_time_saved_ms) || 0) / (1000 * 60 * 60);
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

    // Get team totals
    const totalMachines = machines.results?.length || 0;
    const activeMachines = (machines.results || []).filter(m => m.is_active === 1).length;
    const totalCommands = Number(totalUsage?.total_commands) || 0;
    const totalTimeSaved = Number(totalUsage?.total_time_saved_ms) || 0;

    return jsonResponse({
      license: {
        tier: license.tier,
        max_seats: license.max_seats,
        status: license.status,
      },
      members: membersWithUsage,
      daily_usage: dailyUsage.results || [],
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
  } catch (error) {
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

  let body: { machine_id?: string };
  try {
    // SAFETY: The request boundary is restricted to the documented machine field.
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
  if (!body.machine_id) {
    return errorResponse('Machine ID required');
  }

  // Get license
  const license = await env.DB.prepare(
    `
    SELECT id FROM licenses WHERE customer_id = ?
  `
  )
    .bind(auth.user.id)
    .first();

  if (!license) {
    return errorResponse('License not found', 404);
  }

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
  const license = await env.DB.prepare(
    `
    SELECT tier FROM licenses WHERE customer_id = ?
  `
  )
    .bind(auth.user.id)
    .first();

  // SAFETY: License tier is a string value from the licenses schema.
  if (!license || (license.tier !== 'team' && license.tier !== 'enterprise')) {
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

  return jsonResponse({ logs: logs.results || [] });
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
