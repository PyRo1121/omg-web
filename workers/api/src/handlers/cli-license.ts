import * as Schema from 'effect/Schema';
import { Effect, Exit } from 'effect';
import {
  type Env,
  enforceRateLimit,
  errorResponse,
  getAuthToken,
  jsonResponse,
  rateLimitClientIp,
} from '../api';
import {
  DashboardAuditLogRowSchema,
  PolicyRowSchema,
  TeamMemberMachineRowSchema,
  decodeExtraRowArray,
  isInvalidExtraRow,
  readOptionalExtraRow,
} from '../contracts/d1-extras';

const CLI_RESULT_LIMIT = 100;
const TEAM_TIERS = new Set(['team', 'enterprise']);
const ENTERPRISE_TIERS = new Set(['enterprise']);
const CliLicenseRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  customer_id: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
});

interface CliLicenseContext {
  readonly customerId: string;
  readonly licenseId: string;
}

async function loadCliLicense(
  request: Request,
  env: Env,
  allowedTiers: ReadonlySet<string>
): Promise<CliLicenseContext | Response> {
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `cli_license:${rateLimitClientIp(request)}`
  );
  if (limited !== null) {
    return limited;
  }

  const credential = getAuthToken(request);
  if (credential === null) {
    return errorResponse('Invalid license', 401);
  }

  try {
    const row = await env.DB.prepare(
      `SELECT id, customer_id, tier
       FROM licenses
       WHERE license_key = ?
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`
    )
      .bind(credential)
      .first();
    const license = await readOptionalExtraRow(
      CliLicenseRowSchema,
      'CLI license row has an invalid shape',
      row
    );
    if (isInvalidExtraRow(license)) {
      return errorResponse('License service unavailable', 500);
    }
    if (license._tag === 'missing') {
      return errorResponse('Invalid license', 401);
    }
    if (!allowedTiers.has(license.value.tier)) {
      return errorResponse('License tier does not permit this operation', 403);
    }
    return {
      customerId: license.value.customer_id,
      licenseId: license.value.id,
    };
  } catch {
    return errorResponse('License service unavailable', 503);
  }
}

/** Return the bounded machine roster consumed by `omg team members` and `omg fleet status`. */
export async function handleCliTeamMembers(request: Request, env: Env): Promise<Response> {
  const license = await loadCliLicense(request, env, TEAM_TIERS);
  if (license instanceof Response) {
    return license;
  }

  try {
    const result = await env.DB.prepare(
      `SELECT
         id, machine_id, hostname, os, arch, omg_version,
         user_name, user_email, is_active, first_seen_at, last_seen_at
       FROM machines
       WHERE license_id = ?
       ORDER BY last_seen_at DESC
       LIMIT ?`
    )
      .bind(license.licenseId, CLI_RESULT_LIMIT)
      .all();
    const decoded = await Effect.runPromiseExit(
      decodeExtraRowArray(
        TeamMemberMachineRowSchema,
        'CLI team member rows have an invalid shape',
        result.results
      )
    );
    if (Exit.isFailure(decoded)) {
      return errorResponse('License service unavailable', 500);
    }

    return jsonResponse(
      decoded.value.map(member => ({
        machine_id: member.machine_id,
        hostname: member.hostname,
        os: member.os,
        arch: member.arch,
        omg_version: member.omg_version,
        last_seen_at: member.last_seen_at,
        is_active: member.is_active === 1,
      }))
    );
  } catch {
    return errorResponse('License service unavailable', 503);
  }
}

/** Return enterprise policy rules without internal identifiers or stored values. */
export async function handleCliPolicies(request: Request, env: Env): Promise<Response> {
  const license = await loadCliLicense(request, env, ENTERPRISE_TIERS);
  if (license instanceof Response) {
    return license;
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, scope, rule, value, enforced, created_at
       FROM policies
       WHERE license_id = ?
       ORDER BY scope, rule
       LIMIT ?`
    )
      .bind(license.licenseId, CLI_RESULT_LIMIT)
      .all();
    const decoded = await Effect.runPromiseExit(
      decodeExtraRowArray(PolicyRowSchema, 'CLI policy rows have an invalid shape', result.results)
    );
    if (Exit.isFailure(decoded)) {
      return errorResponse('License service unavailable', 500);
    }

    return jsonResponse(
      decoded.value.map(policy => ({
        scope: policy.scope,
        rule: policy.rule,
        enforced: policy.enforced === 1,
      }))
    );
  } catch {
    return errorResponse('License service unavailable', 503);
  }
}

/** Return the bounded audit trail owned by the active license customer. */
export async function handleCliAuditLog(request: Request, env: Env): Promise<Response> {
  const license = await loadCliLicense(request, env, TEAM_TIERS);
  if (license instanceof Response) {
    return license;
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, action, resource_type, resource_id, ip_address, created_at
       FROM audit_log
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(license.customerId, CLI_RESULT_LIMIT)
      .all();
    const decoded = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DashboardAuditLogRowSchema,
        'CLI audit rows have an invalid shape',
        result.results
      )
    );
    if (Exit.isFailure(decoded)) {
      return errorResponse('License service unavailable', 500);
    }

    return jsonResponse(
      decoded.value.map(entry => ({
        action: entry.action,
        resource_type: entry.resource_type ?? null,
        resource_id: entry.resource_id ?? null,
        ip_address: entry.ip_address ?? null,
        created_at: entry.created_at,
      }))
    );
  } catch {
    return errorResponse('License service unavailable', 503);
  }
}
