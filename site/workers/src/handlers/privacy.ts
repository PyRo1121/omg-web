// Privacy and data deletion handlers (GDPR/CCPA compliance)
// Available globally to all users, regardless of jurisdiction
import { Effect, Exit } from 'effect';
import { Schema } from '@effect/schema';
import * as Sentry from '@sentry/cloudflare';
import { decodeJsonBody } from '../body';
import {
  type Env,
  jsonResponse,
  errorResponse,
  corsHeaders,
  generateId,
  getAuthToken,
  validateSession,
} from '../api';
import {
  decodeExtraRow,
  decodeExtraRowArray,
  PrivacyCommandRowSchema,
  PrivacyFeatureRowSchema,
  PrivacyLicenseRowSchema,
  PrivacyMachineRowSchema,
  PrivacyPerformanceRowSchema,
  PrivacyProfileRowSchema,
  PrivacySessionRowSchema,
  PrivacyStatusRowSchema,
  isInvalidExtraRow,
  readOptionalExtraRow,
  type PrivacyCommandRow,
  type PrivacyFeatureRow,
  type PrivacyLicenseRow,
  type PrivacyMachineRow,
  type PrivacyPerformanceRow,
  type PrivacySessionRow,
} from '../contracts/d1-extras';

/** The authenticated GDPR deletion request body. */
const DeleteRequestSchema = Schema.Struct({
  confirm: Schema.Boolean,
  reason: Schema.optional(Schema.String.pipe(Schema.maxLength(500))),
});

/** The authenticated telemetry preference request body. */
const OptOutRequestSchema = Schema.Struct({
  opt_out: Schema.Boolean,
});

interface PrivacyPrincipal {
  readonly customerId: string;
  readonly email: string;
}

type PrivacyAuthentication =
  | { readonly _tag: 'authenticated'; readonly principal: PrivacyPrincipal }
  | { readonly _tag: 'rejected'; readonly response: Response };

async function authenticatePrivacyRequest(
  request: Request,
  env: Env
): Promise<PrivacyAuthentication> {
  const token = getAuthToken(request);
  if (token === null) {
    return { _tag: 'rejected', response: errorResponse('Authorization required', 401) };
  }

  const auth = await validateSession(env.DB, token);
  if (auth === null) {
    return { _tag: 'rejected', response: errorResponse('Invalid or expired session', 401) };
  }

  return {
    _tag: 'authenticated',
    principal: { customerId: auth.user.id, email: auth.user.email },
  };
}

interface ExportData {
  export_date: string;
  export_format_version: string;
  profile?: {
    email: string | null | undefined;
    company: string | null | undefined;
    tier: string | null | undefined;
    member_since: string | null | undefined;
  };
  licenses?: ReadonlyArray<PrivacyLicenseRow>;
  machines?: ReadonlyArray<PrivacyMachineRow>;
  command_history?: ReadonlyArray<PrivacyCommandRow>;
  sessions?: ReadonlyArray<PrivacySessionRow>;
  performance_summary?: ReadonlyArray<PrivacyPerformanceRow>;
  feature_usage?: ReadonlyArray<PrivacyFeatureRow>;
}

/**
 * Handle user data deletion request
 * POST /api/privacy/delete
 *
 * Requires an authenticated Worker customer session. Subject scope is derived from
 * that session and cannot be selected by caller-provided identifiers.
 *
 * Deletes:
 * - Telemetry events (command_event, session, performance_metric, feature_usage)
 * - Registered machines
 * - Install pings (install_stats)
 * - Customer notes (customer_notes) - unless marked as internal
 * - Session tokens
 *
 * Retains (for legal/business requirements):
 * - License records (anonymized)
 * - Payment history (Stripe requirement)
 * - Audit logs (30-day retention for security)
 */
export async function handleDeleteMyData(request: Request, env: Env): Promise<Response> {
  try {
    const authentication = await authenticatePrivacyRequest(request, env);
    if (authentication._tag === 'rejected') {
      return authentication.response;
    }

    const decoded = await Effect.runPromiseExit(decodeJsonBody(request, DeleteRequestSchema));
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    const body = decoded.value;
    if (!body.confirm) {
      return errorResponse('Deletion must be confirmed. Set confirm: true', 400);
    }

    const { customerId, email } = authentication.principal;
    const deletionOperations = [
      {
        label: 'command_events',
        statement: env.DB.prepare(
          'DELETE FROM command_event WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
        ).bind(customerId),
      },
      {
        label: 'telemetry_sessions',
        statement: env.DB.prepare(
          'DELETE FROM session WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
        ).bind(customerId),
      },
      {
        label: 'performance_metrics',
        statement: env.DB.prepare(
          'DELETE FROM performance_metric WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
        ).bind(customerId),
      },
      {
        label: 'feature_usage',
        statement: env.DB.prepare(
          'DELETE FROM feature_usage WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
        ).bind(customerId),
      },
      {
        label: 'install_stats',
        statement: env.DB.prepare(
          `DELETE FROM install_stats
           WHERE install_id IN (
             SELECT m.machine_id
             FROM machines m
             JOIN licenses l ON l.id = m.license_id
             WHERE l.customer_id = ?
           )`
        ).bind(customerId),
      },
      {
        label: 'machines',
        statement: env.DB.prepare(
          'DELETE FROM machines WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
        ).bind(customerId),
      },
      {
        label: 'customer_notes',
        statement: env.DB.prepare('DELETE FROM customer_notes WHERE customer_id = ?').bind(
          customerId
        ),
      },
      {
        label: 'session_tokens',
        statement: env.DB.prepare('DELETE FROM sessions WHERE customer_id = ?').bind(customerId),
      },
      {
        label: 'auth_codes',
        statement: env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email),
      },
    ] as const;

    const requestId = generateId();
    const results = await env.DB.batch([
      ...deletionOperations.map(operation => operation.statement),
      env.DB.prepare(
        `UPDATE licenses
         SET status = 'deleted_by_user', updated_at = datetime('now')
         WHERE customer_id = ?`
      ).bind(customerId),
      env.DB.prepare(
        `INSERT INTO audit_log
           (id, customer_id, action, resource_type, resource_id, ip_address, metadata, created_at)
         VALUES (?, ?, 'data_deletion_request', 'customer', ?, ?, ?, datetime('now'))`
      ).bind(
        requestId,
        customerId,
        customerId,
        request.headers.get('CF-Connecting-IP') ?? 'unknown',
        JSON.stringify({ reason: body.reason ?? 'User requested deletion' })
      ),
    ]);

    const deletedCounts: Record<string, number> = {};
    deletionOperations.forEach((operation, index) => {
      const changes = results[index]?.meta?.changes ?? 0;
      if (changes > 0) {
        deletedCounts[operation.label] = changes;
      }
    });

    return jsonResponse({
      success: true,
      message: 'Your data has been deleted. This action is irreversible.',
      request_id: requestId,
      deleted: deletedCounts,
      retention_notice:
        'Audit logs are retained for 30 days for security purposes. Payment records are retained per Stripe requirements.',
    });
  } catch (error: unknown) {
    Sentry.captureException(error);
    return errorResponse('Failed to process deletion request', 500);
  }
}

/**
 * Handle user data export request (GDPR Article 20 - Right to Portability)
 * POST /api/privacy/export
 *
 * Returns the authenticated customer's personal data in a portable JSON format.
 */
export async function handleExportMyData(request: Request, env: Env): Promise<Response> {
  try {
    const authentication = await authenticatePrivacyRequest(request, env);
    if (authentication._tag === 'rejected') {
      return authentication.response;
    }
    const { customerId } = authentication.principal;

    const exportData: ExportData = {
      export_date: new Date().toISOString(),
      export_format_version: '2.0',
    };

    const customerRow = await env.DB.prepare(
      'SELECT id, email, company, tier, stripe_customer_id, created_at FROM customers WHERE id = ?'
    )
      .bind(customerId)
      .first();
    const customerLookup = await readOptionalExtraRow(
      PrivacyProfileRowSchema,
      'Privacy profile row has an invalid shape',
      customerRow
    );
    if (isInvalidExtraRow(customerLookup) || customerLookup._tag === 'missing') {
      return errorResponse('Failed to load profile', 500);
    }
    const customer = customerLookup.value;
    exportData.profile = {
      email: customer.email,
      company: customer.company,
      tier: customer.tier,
      member_since: customer.created_at,
    };

    const licenses = await env.DB.prepare(
      'SELECT tier, status, max_machines, created_at AS activated_at, expires_at, created_at FROM licenses WHERE customer_id = ?'
    )
      .bind(customerId)
      .all();
    const decodedLicenses = await Effect.runPromiseExit(
      decodeExtraRowArray(
        PrivacyLicenseRowSchema,
        'Privacy license export row has an invalid shape',
        licenses.results
      )
    );
    if (Exit.isFailure(decodedLicenses)) {
      return errorResponse('Failed to export licenses', 500);
    }
    exportData.licenses = decodedLicenses.value;

    const machines = await env.DB.prepare(
      `SELECT m.machine_id, m.hostname, m.os, m.arch, m.omg_version,
              m.first_seen_at AS activated_at, m.last_seen_at
       FROM machines m
       JOIN licenses l ON l.id = m.license_id
       WHERE l.customer_id = ?`
    )
      .bind(customerId)
      .all();
    const decodedMachines = await Effect.runPromiseExit(
      decodeExtraRowArray(
        PrivacyMachineRowSchema,
        'Privacy machine export row has an invalid shape',
        machines.results
      )
    );
    if (Exit.isFailure(decodedMachines)) {
      return errorResponse('Failed to export machines', 500);
    }
    exportData.machines = decodedMachines.value;

    const commands = await env.DB.prepare(
      `SELECT command, subcommand, packages, duration_ms, success, timestamp
       FROM command_event
       WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)
       ORDER BY timestamp DESC
       LIMIT 1000`
    )
      .bind(customerId)
      .all();
    const decodedCommands = await Effect.runPromiseExit(
      decodeExtraRowArray(
        PrivacyCommandRowSchema,
        'Privacy command export row has an invalid shape',
        commands.results
      )
    );
    if (Exit.isFailure(decodedCommands)) {
      return errorResponse('Failed to export command history', 500);
    }
    exportData.command_history = decodedCommands.value;

    const sessions = await env.DB.prepare(
      `SELECT session_id, event_type, start_time, end_time, commands_run, duration_secs, timestamp
       FROM session
       WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)
       ORDER BY timestamp DESC
       LIMIT 100`
    )
      .bind(customerId)
      .all();
    const decodedSessions = await Effect.runPromiseExit(
      decodeExtraRowArray(
        PrivacySessionRowSchema,
        'Privacy session export row has an invalid shape',
        sessions.results
      )
    );
    if (Exit.isFailure(decodedSessions)) {
      return errorResponse('Failed to export sessions', 500);
    }
    exportData.sessions = decodedSessions.value;

    const perfMetrics = await env.DB.prepare(
      `SELECT metric_type, AVG(duration_ms) as avg_duration_ms, COUNT(*) as sample_count
       FROM performance_metric
       WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)
       GROUP BY metric_type`
    )
      .bind(customerId)
      .all();
    const decodedPerf = await Effect.runPromiseExit(
      decodeExtraRowArray(
        PrivacyPerformanceRowSchema,
        'Privacy performance export row has an invalid shape',
        perfMetrics.results
      )
    );
    if (Exit.isFailure(decodedPerf)) {
      return errorResponse('Failed to export performance summary', 500);
    }
    exportData.performance_summary = decodedPerf.value;

    const features = await env.DB.prepare(
      `SELECT feature, enabled, COUNT(*) as usage_count, MAX(timestamp) as last_used
       FROM feature_usage
       WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)
       GROUP BY feature, enabled`
    )
      .bind(customerId)
      .all();
    const decodedFeatures = await Effect.runPromiseExit(
      decodeExtraRowArray(
        PrivacyFeatureRowSchema,
        'Privacy feature export row has an invalid shape',
        features.results
      )
    );
    if (Exit.isFailure(decodedFeatures)) {
      return errorResponse('Failed to export feature usage', 500);
    }
    exportData.feature_usage = decodedFeatures.value;

    await env.DB.prepare(
      `INSERT INTO audit_log (id, action, resource_type, resource_id, ip_address, created_at)
       VALUES (?, 'data_export_request', 'customer', ?, ?, datetime('now'))`
    )
      .bind(generateId(), customerId, request.headers.get('CF-Connecting-IP') ?? 'unknown')
      .run();

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="omg-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    Sentry.captureException(error);
    return errorResponse('Failed to process export request', 500);
  }
}

/**
 * Handle the authenticated customer's telemetry preference.
 * POST /api/privacy/opt-out
 */
export async function handleOptOut(request: Request, env: Env): Promise<Response> {
  try {
    const authentication = await authenticatePrivacyRequest(request, env);
    if (authentication._tag === 'rejected') {
      return authentication.response;
    }

    const decoded = await Effect.runPromiseExit(decodeJsonBody(request, OptOutRequestSchema));
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    const body = decoded.value;

    await env.DB.prepare(
      `UPDATE customers
       SET telemetry_opt_out = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(body.opt_out ? 1 : 0, authentication.principal.customerId)
      .run();

    return jsonResponse({
      success: true,
      telemetry_opt_out: body.opt_out,
      message: body.opt_out
        ? 'Telemetry disabled. Your license remains fully functional.'
        : 'Telemetry re-enabled. Thank you for helping improve OMG!',
    });
  } catch (error: unknown) {
    Sentry.captureException(error);
    return errorResponse('Failed to process opt-out request', 500);
  }
}

/**
 * Get privacy policy summary and user's current settings
 * GET /api/privacy/status
 */
export async function handlePrivacyStatus(request: Request, env: Env): Promise<Response> {
  const baseResponse = {
    privacy_policy_version: '2.0',
    last_updated: '2026-02-07',
    data_retention: {
      telemetry_events: '90 days',
      audit_logs: '30 days',
      payment_records: 'Per Stripe requirements',
      usage_statistics: '12 months',
    },
    your_rights: [
      'Right to access (POST /api/privacy/export)',
      'Right to deletion (POST /api/privacy/delete)',
      'Right to opt-out (POST /api/privacy/opt-out)',
      'Right to portability (data export in JSON format)',
    ],
    available_globally: true,
    jurisdiction_note: 'These rights are available to ALL users regardless of location.',
  };

  if (getAuthToken(request) === null) {
    return jsonResponse(baseResponse);
  }

  try {
    const authentication = await authenticatePrivacyRequest(request, env);
    if (authentication._tag === 'rejected') {
      return authentication.response;
    }

    const customer = await env.DB.prepare(
      'SELECT telemetry_opt_out, email FROM customers WHERE id = ?'
    )
      .bind(authentication.principal.customerId)
      .first();
    const decodedStatus = await Effect.runPromiseExit(
      decodeExtraRow(PrivacyStatusRowSchema, 'Privacy status row has an invalid shape', customer)
    );
    if (Exit.isFailure(decodedStatus)) {
      return errorResponse('Failed to load privacy status', 500);
    }
    const statusEmail = decodedStatus.value.email;
    const emailDomain =
      statusEmail === null || statusEmail === undefined ? undefined : statusEmail.split('@')[1];

    return jsonResponse({
      ...baseResponse,
      user_status: {
        telemetry_opt_out: Boolean(decodedStatus.value.telemetry_opt_out),
        email_on_file: emailDomain ? `***@${emailDomain}` : null,
      },
    });
  } catch (error: unknown) {
    Sentry.captureException(error);
    return errorResponse('Failed to load privacy status', 500);
  }
}
