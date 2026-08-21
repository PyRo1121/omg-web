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
  decodeTeamControlsRowArray,
  DeletePolicyBodySchema,
  NotificationSettingRowSchema,
  RevokeMemberBodySchema,
  UpdateNotificationSettingsBodySchema,
  UpdatePolicyBodySchema,
  type NotificationSetting,
} from '../contracts/team-controls';
import {
  decodeExtraRowArray,
  HostnameRowSchema,
  isTeamOrEnterpriseTier,
  LicenseIdTierRowSchema,
  LicenseSeatsRowSchema,
  PolicyRowSchema,
  isInvalidExtraRow,
  readOptionalExtraRow,
  TeamControlMemberRowSchema,
  TotalRowSchema,
  type LicenseIdTierRow,
  type OptionalExtraRow,
} from '../contracts/d1-extras';

async function loadActiveLicenseIdTier(
  db: D1Database,
  customerId: string
): Promise<OptionalExtraRow<LicenseIdTierRow>> {
  const row = await db
    .prepare(`SELECT l.id, l.tier FROM licenses l WHERE l.customer_id = ? AND l.status = 'active'`)
    .bind(customerId)
    .first();
  return readOptionalExtraRow(
    LicenseIdTierRowSchema,
    'License id/tier row has an invalid shape',
    row
  );
}

function requireTeamLicense(
  license: OptionalExtraRow<LicenseIdTierRow>,
  forbiddenMessage: string
): { readonly error: Response } | { readonly license: LicenseIdTierRow } {
  if (license._tag === 'invalid') {
    return { error: errorResponse('Failed to load license', 500) };
  }
  if (license._tag === 'missing' || !isTeamOrEnterpriseTier(license.value.tier)) {
    return { error: errorResponse(forbiddenMessage, 403) };
  }
  return { license: license.value };
}

function requireEnterpriseLicense(
  license: OptionalExtraRow<LicenseIdTierRow>,
  forbiddenMessage: string
): { readonly error: Response } | { readonly license: LicenseIdTierRow } {
  if (license._tag === 'invalid') {
    return { error: errorResponse('Failed to load license', 500) };
  }
  if (license._tag === 'missing' || license.value.tier !== 'enterprise') {
    return { error: errorResponse(forbiddenMessage, 403) };
  }
  return { license: license.value };
}

export async function handleGetPolicies(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const loaded = requireTeamLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Policies require Team or Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;
  const { license } = loaded;

  const policies = await env.DB.prepare(
    `SELECT id, scope, rule, value, enforced, created_at FROM policies WHERE license_id = ? ORDER BY scope, rule`
  )
    .bind(license.id)
    .all();
  const decodedPolicies = await Effect.runPromiseExit(
    decodeExtraRowArray(PolicyRowSchema, 'Policy rows have an invalid shape', policies.results)
  );
  if (Exit.isFailure(decodedPolicies)) {
    return errorResponse('Failed to load policies', 500);
  }

  return jsonResponse({ policies: decodedPolicies.value });
}

export async function handleCreatePolicy(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const loaded = requireEnterpriseLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Policy management requires Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;
  const { license } = loaded;

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

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'policy.create', 'policy', policyId, request, {
      scope,
      rule,
      value,
    })
  );

  return jsonResponse({ success: true, policy: { id: policyId, scope, rule, value, enforced } });
}

export async function handleUpdatePolicy(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const loaded = requireEnterpriseLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Policy management requires Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;
  const { license } = loaded;

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

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'policy.update', 'policy', id, request, { value, enforced })
  );

  return jsonResponse({ success: true });
}

export async function handleDeletePolicy(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const loaded = requireEnterpriseLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Policy management requires Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;
  const { license } = loaded;

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, DeletePolicyBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const { id } = decoded.value;

  if (!id) return errorResponse('Missing policy id', 400);

  await env.DB.prepare(`DELETE FROM policies WHERE id = ? AND license_id = ?`)
    .bind(id, license.id)
    .run();

  await Effect.runPromise(logAudit(env.DB, auth.user.id, 'policy.delete', 'policy', id, request));

  return jsonResponse({ success: true });
}

export async function handleGetNotificationSettings(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const loaded = requireTeamLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Notifications require Team or Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;
  const { license } = loaded;

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
    decodeTeamControlsRowArray(
      NotificationSettingRowSchema,
      'Notification setting row has an invalid shape',
      settings.results
    )
  );
  if (Exit.isFailure(decodedSettings)) {
    return errorResponse('Failed to load notification settings', 500);
  }

  const existingMap = new Map(decodedSettings.value.map(setting => [setting.type, setting]));
  const merged: NotificationSetting[] = [];
  for (const def of defaultSettings) {
    const existing = existingMap.get(def.type);
    if (existing === undefined) {
      merged.push(def);
      continue;
    }
    const decodedChannels = await Effect.runPromiseExit(
      decodeStoredStringArray(existing.channels, def.channels)
    );
    if (Exit.isFailure(decodedChannels)) {
      return errorResponse('Failed to load notification settings', 500);
    }
    merged.push({
      ...def,
      enabled: !!existing.enabled,
      threshold: existing.threshold ?? def.threshold,
      channels: [...decodedChannels.value],
    });
  }

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

  const loaded = requireTeamLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Notifications require Team or Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;
  const { license } = loaded;

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

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'notifications.update', 'settings', null, request)
  );

  return jsonResponse({ success: true });
}

export async function handleRevokeMember(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const loaded = requireTeamLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Member management requires Team or Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;
  const { license } = loaded;

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

  const machineLookup = await readOptionalExtraRow(
    HostnameRowSchema,
    'Machine hostname row has an invalid shape',
    machineRow
  );
  if (isInvalidExtraRow(machineLookup)) return errorResponse('Failed to load machine', 500);
  if (machineLookup._tag === 'missing') return errorResponse('Machine not found', 404);
  const machine = machineLookup.value;

  await env.DB.prepare(
    `UPDATE machines SET is_active = 0, revoked_at = datetime('now') WHERE machine_id = ? AND license_id = ?`
  )
    .bind(machine_id, license.id)
    .run();

  await env.DB.prepare(`UPDATE licenses SET used_seats = MAX(0, used_seats - 1) WHERE id = ?`)
    .bind(license.id)
    .run();

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'member.revoke', 'machine', machine_id, request, {
      hostname: machine.hostname,
    })
  );

  return jsonResponse({ success: true, message: 'Machine access revoked' });
}

export async function handleGetAuditLogs(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);

  const loaded = requireTeamLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Audit logs require Team or Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;

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
  const totalLookup = await readOptionalExtraRow(
    TotalRowSchema,
    'Audit log count has an invalid shape',
    countResult
  );
  if (isInvalidExtraRow(totalLookup)) return errorResponse('Failed to load audit logs', 500);
  const totalRow = totalLookup._tag === 'present' ? totalLookup.value : undefined;

  const decodedLogs = await Effect.runPromiseExit(
    decodeTeamControlsRowArray(
      AuditLogRowSchema,
      'Audit log row has an invalid shape',
      logs.results
    )
  );
  if (Exit.isFailure(decodedLogs)) {
    return errorResponse('Failed to load audit logs', 500);
  }

  const decodedWithMetadata = await Effect.runPromiseExit(
    Effect.forEach(decodedLogs.value, log =>
      decodeStoredJsonObject(log.metadata).pipe(
        Effect.map(metadata => ({
          ...log,
          metadata,
        }))
      )
    )
  );
  if (Exit.isFailure(decodedWithMetadata)) {
    return errorResponse('Failed to load audit logs', 500);
  }

  return jsonResponse({
    logs: decodedWithMetadata.value,
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
  const licenseLookup = await readOptionalExtraRow(
    LicenseSeatsRowSchema,
    'License seats row has an invalid shape',
    licenseRow
  );
  if (licenseLookup._tag === 'invalid') {
    return errorResponse('Failed to load license', 500);
  }
  if (licenseLookup._tag === 'missing' || !isTeamOrEnterpriseTier(licenseLookup.value.tier)) {
    return errorResponse('Team members require Team or Enterprise tier', 403);
  }
  const license = licenseLookup.value;

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

  const decodedMembers = await Effect.runPromiseExit(
    decodeExtraRowArray(
      TeamControlMemberRowSchema,
      'Team member rows have an invalid shape',
      members.results
    )
  );
  if (Exit.isFailure(decodedMembers)) {
    return errorResponse('Failed to load team members', 500);
  }

  return jsonResponse({
    members: decodedMembers.value,
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

  const loaded = requireTeamLicense(
    await loadActiveLicenseIdTier(env.DB, auth.user.id),
    'Alert thresholds require Team or Enterprise tier'
  );
  if ('error' in loaded) return loaded.error;
  const { license } = loaded;

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

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'threshold.update', 'alert', threshold_type, request, {
      value,
    })
  );

  return jsonResponse({ success: true });
}
