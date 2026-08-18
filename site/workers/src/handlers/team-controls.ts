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
  AlertThresholdBodySchema,
  AuditLogRowSchema,
  CreatePolicyBodySchema,
  decodeStoredJsonObject,
  decodeStoredStringArray,
  decodeTeamControlsRow,
  DeletePolicyBodySchema,
  NotificationSettingRowSchema,
  RevokeMemberBodySchema,
  UpdateNotificationSettingsBodySchema,
  UpdatePolicyBodySchema,
  type NotificationSetting,
} from '../contracts/team-controls';
import {
  decodeOptionalExtraRow,
  HostnameRowSchema,
  isTeamOrEnterpriseTier,
  LicenseIdTierRowSchema,
  LicenseSeatsRowSchema,
  TotalRowSchema,
  type LicenseIdTierRow,
} from '../contracts/d1-extras';

async function loadActiveLicenseIdTier(
  db: D1Database,
  customerId: string
): Promise<LicenseIdTierRow | undefined> {
  const row = await db
    .prepare(`SELECT l.id, l.tier FROM licenses l WHERE l.customer_id = ? AND l.status = 'active'`)
    .bind(customerId)
    .first();
  return Effect.runPromise(
    decodeOptionalExtraRow(LicenseIdTierRowSchema, 'License id/tier row has an invalid shape', row)
  );
}

export async function handleGetPolicies(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || !isTeamOrEnterpriseTier(license.tier)) {
    return errorResponse('Policies require Team or Enterprise tier', 403);
  }

  const policies = await env.DB.prepare(
    `SELECT id, scope, rule, value, enforced, created_at FROM policies WHERE license_id = ? ORDER BY scope, rule`
  )
    .bind(license.id)
    .all();

  return jsonResponse({ policies: policies.results || [] });
}

export async function handleCreatePolicy(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || license.tier !== 'enterprise') {
    return errorResponse('Policy management requires Enterprise tier', 403);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, CreatePolicyBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const { scope, rule, value, enforced = true } = decoded.value;

  if (!scope || !rule || value === undefined) {
    return errorResponse('Missing required fields: scope, rule, value', 400);
  }

  const validScopes = ['runtime', 'package', 'security', 'network'];
  if (!validScopes.includes(scope)) {
    return errorResponse(`Invalid scope. Must be one of: ${validScopes.join(', ')}`, 400);
  }

  const policyId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO policies (id, license_id, scope, rule, value, enforced, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(policyId, license.id, scope, rule, value, enforced ? 1 : 0)
    .run();

  await logAudit(env.DB, auth.user.id, 'policy.create', 'policy', policyId, request, {
    scope,
    rule,
    value,
  });

  return jsonResponse({ success: true, policy: { id: policyId, scope, rule, value, enforced } });
}

export async function handleUpdatePolicy(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || license.tier !== 'enterprise') {
    return errorResponse('Policy management requires Enterprise tier', 403);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, UpdatePolicyBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const { id, value, enforced } = decoded.value;

  if (!id) return errorResponse('Missing policy id', 400);

  const existing = await env.DB.prepare(`SELECT id FROM policies WHERE id = ? AND license_id = ?`)
    .bind(id, license.id)
    .first();

  if (!existing) return errorResponse('Policy not found', 404);

  const updates: string[] = [];
  const values: Array<string | number> = [];

  if (value !== undefined) {
    updates.push('value = ?');
    values.push(value);
  }
  if (enforced !== undefined) {
    updates.push('enforced = ?');
    values.push(enforced ? 1 : 0);
  }

  if (updates.length === 0) return errorResponse('No updates provided', 400);

  await env.DB.prepare(`UPDATE policies SET ${updates.join(', ')} WHERE id = ? AND license_id = ?`)
    .bind(...values, id, license.id)
    .run();

  await logAudit(env.DB, auth.user.id, 'policy.update', 'policy', id, request, { value, enforced });

  return jsonResponse({ success: true });
}

export async function handleDeletePolicy(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || license.tier !== 'enterprise') {
    return errorResponse('Policy management requires Enterprise tier', 403);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, DeletePolicyBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const { id } = decoded.value;

  if (!id) return errorResponse('Missing policy id', 400);

  await env.DB.prepare(`DELETE FROM policies WHERE id = ? AND license_id = ?`)
    .bind(id, license.id)
    .run();

  await logAudit(env.DB, auth.user.id, 'policy.delete', 'policy', id, request);

  return jsonResponse({ success: true });
}

export async function handleGetNotificationSettings(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || !isTeamOrEnterpriseTier(license.tier)) {
    return errorResponse('Notifications require Team or Enterprise tier', 403);
  }

  const settings = await env.DB.prepare(
    `SELECT type, enabled, threshold, channels FROM notification_settings WHERE license_id = ?`
  )
    .bind(license.id)
    .all();

  const defaultSettings: NotificationSetting[] = [
    { type: 'vulnerability_critical', enabled: true, channels: ['email', 'dashboard'] },
    { type: 'vulnerability_high', enabled: true, channels: ['dashboard'] },
    { type: 'member_inactive', enabled: true, threshold: 7, channels: ['email'] },
    { type: 'seat_quota_warning', enabled: true, threshold: 80, channels: ['email', 'dashboard'] },
    { type: 'policy_violation', enabled: true, channels: ['email', 'dashboard'] },
    { type: 'license_expiring', enabled: true, threshold: 30, channels: ['email'] },
  ];

  const decodedSettings = await Effect.runPromiseExit(
    Effect.forEach(settings.results || [], row =>
      decodeTeamControlsRow(
        NotificationSettingRowSchema,
        'Notification setting row has an invalid shape',
        row
      )
    )
  );
  if (Exit.isFailure(decodedSettings)) {
    return errorResponse('Failed to load notification settings', 500);
  }

  const existingMap = new Map(decodedSettings.value.map(setting => [setting.type, setting]));
  const merged = defaultSettings.map(def => {
    const existing = existingMap.get(def.type);
    if (existing) {
      return {
        ...def,
        enabled: !!existing.enabled,
        threshold: existing.threshold ?? def.threshold,
        channels: decodeStoredStringArray(existing.channels, def.channels),
      };
    }
    return def;
  });

  return jsonResponse({ settings: merged });
}

export async function handleUpdateNotificationSettings(
  request: Request,
  env: Env
): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || !isTeamOrEnterpriseTier(license.tier)) {
    return errorResponse('Notifications require Team or Enterprise tier', 403);
  }

  const decoded = await Effect.runPromiseExit(
    decodeJsonBody(request, UpdateNotificationSettingsBodySchema)
  );
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const { settings } = decoded.value;

  if (!settings || !Array.isArray(settings)) {
    return errorResponse('Missing settings array', 400);
  }

  for (const setting of settings) {
    await env.DB.prepare(
      `INSERT INTO notification_settings (id, license_id, type, enabled, threshold, channels)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(license_id, type) DO UPDATE SET enabled = ?, threshold = ?, channels = ?`
    )
      .bind(
        crypto.randomUUID(),
        license.id,
        setting.type,
        setting.enabled ? 1 : 0,
        setting.threshold ?? null,
        JSON.stringify(setting.channels),
        setting.enabled ? 1 : 0,
        setting.threshold ?? null,
        JSON.stringify(setting.channels)
      )
      .run();
  }

  await logAudit(env.DB, auth.user.id, 'notifications.update', 'settings', null, request);

  return jsonResponse({ success: true });
}

export async function handleRevokeMember(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || !isTeamOrEnterpriseTier(license.tier)) {
    return errorResponse('Member management requires Team or Enterprise tier', 403);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, RevokeMemberBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const { machine_id } = decoded.value;

  if (!machine_id) return errorResponse('Missing machine_id', 400);

  const machineRow = await env.DB.prepare(
    `SELECT hostname FROM machines WHERE machine_id = ? AND license_id = ?`
  )
    .bind(machine_id, license.id)
    .first();

  const machine = await Effect.runPromise(
    decodeOptionalExtraRow(
      HostnameRowSchema,
      'Machine hostname row has an invalid shape',
      machineRow
    )
  );
  if (machine === undefined) return errorResponse('Machine not found', 404);

  await env.DB.prepare(
    `UPDATE machines SET is_active = 0, revoked_at = datetime('now') WHERE machine_id = ? AND license_id = ?`
  )
    .bind(machine_id, license.id)
    .run();

  await env.DB.prepare(`UPDATE licenses SET used_seats = MAX(0, used_seats - 1) WHERE id = ?`)
    .bind(license.id)
    .run();

  await logAudit(env.DB, auth.user.id, 'member.revoke', 'machine', machine_id, request, {
    hostname: machine.hostname,
  });

  return jsonResponse({ success: true, message: 'Machine access revoked' });
}

export async function handleGetAuditLogs(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || !isTeamOrEnterpriseTier(license.tier)) {
    return errorResponse('Audit logs require Team or Enterprise tier', 403);
  }

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return errorResponse('Invalid request URL', 400);
  }
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const action = url.searchParams.get('action');
  const resource_type = url.searchParams.get('resource_type');

  let query = `SELECT id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at 
               FROM audit_log WHERE customer_id = ?`;
  const params: Array<string | number> = [auth.user.id];

  if (action) {
    query += ` AND action LIKE ?`;
    params.push(`%${action}%`);
  }
  if (resource_type) {
    query += ` AND resource_type = ?`;
    params.push(resource_type);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const logs = await env.DB.prepare(query)
    .bind(...params)
    .all();

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM audit_log WHERE customer_id = ?`
  )
    .bind(auth.user.id)
    .first();
  const totalRow = await Effect.runPromise(
    decodeOptionalExtraRow(TotalRowSchema, 'Audit log count has an invalid shape', countResult)
  );

  const decodedLogs = await Effect.runPromiseExit(
    Effect.forEach(logs.results || [], row =>
      decodeTeamControlsRow(AuditLogRowSchema, 'Audit log row has an invalid shape', row)
    )
  );
  if (Exit.isFailure(decodedLogs)) {
    return errorResponse('Failed to load audit logs', 500);
  }

  return jsonResponse({
    logs: decodedLogs.value.map(log => ({
      ...log,
      metadata: log.metadata ? decodeStoredJsonObject(log.metadata) : null,
    })),
    total: totalRow?.total ?? 0,
    limit,
    offset,
  });
}

export async function handleGetTeamMembers(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const licenseRow = await env.DB.prepare(
    `SELECT l.id, l.tier, l.max_seats, l.used_seats FROM licenses l WHERE l.customer_id = ? AND l.status = 'active'`
  )
    .bind(auth.user.id)
    .first();
  const license = await Effect.runPromise(
    decodeOptionalExtraRow(
      LicenseSeatsRowSchema,
      'License seats row has an invalid shape',
      licenseRow
    )
  );

  if (license === undefined || !isTeamOrEnterpriseTier(license.tier)) {
    return errorResponse('Team members require Team or Enterprise tier', 403);
  }

  const members = await env.DB.prepare(
    `
    SELECT 
      m.machine_id,
      m.hostname,
      m.os,
      m.arch,
      m.omg_version,
      m.last_seen_at,
      m.first_seen_at,
      m.is_active,
      COALESCE(SUM(u.commands_run), 0) as total_commands,
      COALESCE(SUM(u.time_saved_ms), 0) as total_time_saved_ms,
      COALESCE(SUM(CASE WHEN u.date >= date('now', '-7 days') THEN u.commands_run ELSE 0 END), 0) as commands_last_7d
    FROM machines m
    LEFT JOIN usage_daily u ON m.machine_id = u.machine_id AND m.license_id = u.license_id
    WHERE m.license_id = ?
    GROUP BY m.machine_id
    ORDER BY m.last_seen_at DESC
  `
  )
    .bind(license.id)
    .all();

  return jsonResponse({
    members: members.results || [],
    seats: {
      used: license.used_seats || 0,
      max: license.max_seats || 25,
    },
  });
}

export async function handleUpdateAlertThreshold(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const license = await loadActiveLicenseIdTier(env.DB, auth.user.id);
  if (license === undefined || !isTeamOrEnterpriseTier(license.tier)) {
    return errorResponse('Alert thresholds require Team or Enterprise tier', 403);
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, AlertThresholdBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const { threshold_type, value } = decoded.value;

  if (!threshold_type || value === undefined) {
    return errorResponse('Missing threshold_type or value', 400);
  }

  await env.DB.prepare(
    `INSERT INTO alert_thresholds (id, license_id, threshold_type, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(license_id, threshold_type) DO UPDATE SET value = ?`
  )
    .bind(crypto.randomUUID(), license.id, threshold_type, value, value)
    .run();

  await logAudit(env.DB, auth.user.id, 'threshold.update', 'alert', threshold_type, request, {
    value,
  });

  return jsonResponse({ success: true });
}
