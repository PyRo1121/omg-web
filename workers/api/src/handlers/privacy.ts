// Privacy and data deletion handlers (GDPR/CCPA compliance)
// Available globally to all users, regardless of jurisdiction
import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import * as Sentry from '@sentry/cloudflare';
import { decodeJsonBody } from '../body';
import {
  type Env,
  jsonResponse,
  errorResponse,
  corsHeaders,
  getAuthToken,
  validateSession,
  logAudit,
} from '../api';
import { reportError, reportInfo } from '../observability';
import { enforceIpRateLimit } from './auth';
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

/** Days security audit logs are retained, as promised by the privacy disclosures. */
const AUDIT_LOG_RETENTION_DAYS = 30;

/** Run a handler behind customer session validation. */
async function withPrivacyPrincipal(
  request: Request,
  env: Env,
  handler: (principal: {
    readonly customerId: string;
    readonly email: string;
  }) => Response | Promise<Response>
): Promise<Response> {
  const token = getAuthToken(request);
  if (token === null) {
    return errorResponse('Authorization required', 401);
  }
  const auth = await validateSession(env.DB, token);
  if (auth === null) {
    return errorResponse('Invalid or expired session', 401);
  }
  return handler({ customerId: auth.user.id, email: auth.user.email });
}

/** Query and decode a repeated privacy-export row set. */
async function loadPrivacyRows<S extends Schema.Schema.AnyNoContext>(
  db: D1Database,
  query: string,
  customerId: string,
  schema: S,
  invalidRowMessage: string,
  failureMessage: string
): Promise<ReadonlyArray<Schema.Schema.Type<S>> | Response> {
  const rows = await db.prepare(query).bind(customerId).all();
  const decoded = await Effect.runPromiseExit(
    decodeExtraRowArray(schema, invalidRowMessage, rows.results)
  );
  return Exit.isFailure(decoded) ? errorResponse(failureMessage, 500) : decoded.value;
}

/**
 * Handle user data deletion request
 * POST /api/privacy/delete
 *
 * Requires an authenticated Worker customer session. Subject scope is derived from
 * that session and cannot be selected by caller-provided identifiers.
 *
 * Deletes:
 * - Telemetry events (command_event, session, performance_metric, feature_usage, analytics_events)
 * - Per-license usage rows and active-machine analytics
 * - Registered machines
 * - Install pings (install_stats)
 * - Customer notes (customer_notes)
 * - Session tokens
 *
 * Retains (for legal/business requirements):
 * - License records (anonymized)
 * - Payment history (Stripe requirement)
 * - Audit logs (30-day retention for security)
 *
 * The retained customer row is anonymized in the same deletion batch: the
 * email is replaced with `deleted+<id>@invalid`, and company and Stripe
 * customer linkage are destroyed, so the identity cannot be re-adopted by a
 * future login.
 */
export async function handleDeleteMyData(request: Request, env: Env): Promise<Response> {
  try {
    // Deletion runs a multi-statement destructive batch; throttle per IP.
    const limited = await enforceIpRateLimit(request, env, 'privacy_delete');
    if (limited !== null) {
      return limited;
    }
    return await withPrivacyPrincipal(request, env, async ({ customerId, email }) => {
      const decoded = await Effect.runPromiseExit(decodeJsonBody(request, DeleteRequestSchema));
      if (Exit.isFailure(decoded)) {
        return errorResponse('Invalid JSON body', 400);
      }
      const body = decoded.value;
      if (!body.confirm) {
        return errorResponse('Deletion must be confirmed. Set confirm: true', 400);
      }

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
          label: 'analytics_active_users',
          statement: env.DB.prepare(
            `DELETE FROM analytics_active_users
             WHERE machine_id IN (
               SELECT m.machine_id
               FROM machines m
               JOIN licenses l ON l.id = m.license_id
               WHERE l.customer_id = ?
               UNION
               SELECT ae.machine_id
               FROM analytics_events ae
               JOIN licenses l ON l.license_key = ae.license_key
               WHERE l.customer_id = ?
               UNION
               SELECT u.machine_id
               FROM usage u
               JOIN licenses l ON l.license_key = u.license_key
               WHERE l.customer_id = ?
             )`
          ).bind(customerId, customerId, customerId),
        },
        {
          label: 'analytics_events',
          statement: env.DB.prepare(
            'DELETE FROM analytics_events WHERE license_key IN (SELECT license_key FROM licenses WHERE customer_id = ?)'
          ).bind(customerId),
        },
        {
          label: 'usage',
          statement: env.DB.prepare(
            'DELETE FROM usage WHERE license_key IN (SELECT license_key FROM licenses WHERE customer_id = ?)'
          ).bind(customerId),
        },
        {
          label: 'usage_daily',
          statement: env.DB.prepare(
            'DELETE FROM usage_daily WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
          ).bind(customerId),
        },
        {
          label: 'usage_member_daily',
          statement: env.DB.prepare(
            'DELETE FROM usage_member_daily WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
          ).bind(customerId),
        },
        {
          label: 'usage_package_daily',
          statement: env.DB.prepare(
            'DELETE FROM usage_package_daily WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
          ).bind(customerId),
        },
        {
          label: 'usage_runtime_daily',
          statement: env.DB.prepare(
            'DELETE FROM usage_runtime_daily WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)'
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

      const requestId = crypto.randomUUID();
      const results = await env.DB.batch([
        ...deletionOperations.map(operation => operation.statement),
        env.DB.prepare(
          `UPDATE licenses
         SET status = 'deleted_by_user', updated_at = datetime('now')
         WHERE customer_id = ?`
        ).bind(customerId),
        // Anonymize the retained customer row (GDPR Art. 17): the id stays for
        // license/payment referential integrity, but identity fields are
        // destroyed so a future login mints a fresh identity instead of
        // re-adopting the deleted one. `deleted+<id>@invalid` keeps the email
        // UNIQUE constraint satisfied.
        env.DB.prepare(
          `UPDATE customers
         SET email = 'deleted+' || id || '@invalid',
             company = NULL,
             stripe_customer_id = NULL,
             updated_at = datetime('now')
         WHERE id = ?`
        ).bind(customerId),
        env.DB.prepare(
          `INSERT INTO audit_log
           (id, customer_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at)
         VALUES (?, ?, 'data_deletion_request', 'customer', ?, ?, ?, ?, datetime('now'))`
        ).bind(
          requestId,
          customerId,
          customerId,
          request.headers.get('CF-Connecting-IP') ?? 'unknown',
          request.headers.get('User-Agent'),
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
        retention_notice: `Audit logs are retained for ${AUDIT_LOG_RETENTION_DAYS} days for security purposes. Payment records are retained per Stripe requirements.`,
      });
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
    // Export runs ~7 aggregate D1 queries per call; throttle per IP so one
    // session cannot amplify database cost.
    const limited = await enforceIpRateLimit(request, env, 'privacy_export');
    if (limited !== null) {
      return limited;
    }
    return await withPrivacyPrincipal(request, env, async ({ customerId }) => {
      const exportDate = new Date().toISOString();
      const customerLookup = await readOptionalExtraRow(
        PrivacyProfileRowSchema,
        'Privacy profile row has an invalid shape',
        await env.DB.prepare(
          'SELECT id, email, company, tier, stripe_customer_id, created_at FROM customers WHERE id = ?'
        )
          .bind(customerId)
          .first()
      );
      if (isInvalidExtraRow(customerLookup) || customerLookup._tag === 'missing') {
        return errorResponse('Failed to load profile', 500);
      }
      const customer = customerLookup.value;

      const licenses = await loadPrivacyRows(
        env.DB,
        'SELECT tier, status, max_machines, created_at AS activated_at, expires_at, created_at FROM licenses WHERE customer_id = ?',
        customerId,
        PrivacyLicenseRowSchema,
        'Privacy license export row has an invalid shape',
        'Failed to export licenses'
      );
      if (licenses instanceof Response) return licenses;

      const machines = await loadPrivacyRows(
        env.DB,
        `SELECT m.machine_id, m.hostname, m.os, m.arch, m.omg_version,
                m.first_seen_at AS activated_at, m.last_seen_at
         FROM machines m
         JOIN licenses l ON l.id = m.license_id
         WHERE l.customer_id = ?`,
        customerId,
        PrivacyMachineRowSchema,
        'Privacy machine export row has an invalid shape',
        'Failed to export machines'
      );
      if (machines instanceof Response) return machines;

      const commands = await loadPrivacyRows(
        env.DB,
        `SELECT command, subcommand, packages, duration_ms, success, timestamp
         FROM command_event
         WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)
         ORDER BY timestamp DESC
         LIMIT 1000`,
        customerId,
        PrivacyCommandRowSchema,
        'Privacy command export row has an invalid shape',
        'Failed to export command history'
      );
      if (commands instanceof Response) return commands;

      const sessions = await loadPrivacyRows(
        env.DB,
        `SELECT session_id, event_type, start_time, end_time, commands_run, duration_secs, timestamp
         FROM session
         WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)
         ORDER BY timestamp DESC
         LIMIT 100`,
        customerId,
        PrivacySessionRowSchema,
        'Privacy session export row has an invalid shape',
        'Failed to export sessions'
      );
      if (sessions instanceof Response) return sessions;

      const performanceSummary = await loadPrivacyRows(
        env.DB,
        `SELECT metric_type, AVG(duration_ms) as avg_duration_ms, COUNT(*) as sample_count
         FROM performance_metric
         WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)
         GROUP BY metric_type`,
        customerId,
        PrivacyPerformanceRowSchema,
        'Privacy performance export row has an invalid shape',
        'Failed to export performance summary'
      );
      if (performanceSummary instanceof Response) return performanceSummary;

      const featureUsage = await loadPrivacyRows(
        env.DB,
        `SELECT feature, enabled, COUNT(*) as usage_count, MAX(timestamp) as last_used
         FROM feature_usage
         WHERE license_id IN (SELECT id FROM licenses WHERE customer_id = ?)
         GROUP BY feature, enabled`,
        customerId,
        PrivacyFeatureRowSchema,
        'Privacy feature export row has an invalid shape',
        'Failed to export feature usage'
      );
      if (featureUsage instanceof Response) return featureUsage;

      await Effect.runPromise(
        logAudit(env.DB, customerId, 'data_export_request', 'customer', customerId, request)
      );

      const exportData = {
        export_date: exportDate,
        export_format_version: '2.0',
        profile: {
          email: customer.email,
          company: customer.company,
          tier: customer.tier,
          member_since: customer.created_at,
        },
        licenses,
        machines,
        command_history: commands,
        sessions,
        performance_summary: performanceSummary,
        feature_usage: featureUsage,
      };
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
    return await withPrivacyPrincipal(request, env, async ({ customerId }) => {
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
        .bind(body.opt_out ? 1 : 0, customerId)
        .run();
      await Effect.runPromise(
        logAudit(
          env.DB,
          customerId,
          body.opt_out ? 'user.telemetry_opted_out' : 'user.telemetry_opt_in',
          'customer',
          customerId,
          request
        )
      );

      return jsonResponse({
        success: true,
        telemetry_opt_out: body.opt_out,
        message: body.opt_out
          ? 'Telemetry disabled. Your license remains fully functional.'
          : 'Telemetry re-enabled. Thank you for helping improve OMG!',
      });
    });
  } catch (error: unknown) {
    Sentry.captureException(error);
    return errorResponse('Failed to process opt-out request', 500);
  }
}

/**
 * Delete audit rows older than the retention window promised by the privacy
 * disclosures. Mirrors `cleanupAnalyticsRetention`; must be invoked from the Worker's
 * `scheduled` handler for the advertised retention to hold.
 */
export async function cleanupExpiredAuditLogs(db: D1Database): Promise<void> {
  try {
    // Compare in the same format CURRENT_TIMESTAMP writes (YYYY-MM-DD HH:MM:SS);
    // an ISO cutoff would order inconsistently against the column default.
    await db
      .prepare(
        `DELETE FROM audit_log WHERE created_at < datetime('now', '-${AUDIT_LOG_RETENTION_DAYS} days')`
      )
      .run();

    reportInfo('Cleaned up expired audit log entries');
  } catch (error: unknown) {
    reportError('Audit log cleanup error:', error);
  }
}

/**
 * Get privacy policy summary and user's current settings
 * GET /api/privacy/status
 */
export async function handlePrivacyStatus(request: Request, env: Env): Promise<Response> {
  const baseResponse = {
    privacy_policy_version: '2.1',
    last_updated: '2026-09-01',
    data_retention: {
      audit_logs: `${AUDIT_LOG_RETENTION_DAYS} days`,
      cli_telemetry_events: '90 days',
      documentation_analytics_events: '7 days',
      documentation_analytics_sessions: '30 days',
      introductory_offer_requests: '12 months',
      payment_records: 'As required by Stripe and applicable law',
      usage_statistics: '12 months',
      website_analytics_events: '90 days',
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
    return await withPrivacyPrincipal(request, env, async ({ customerId }) => {
      const customer = await env.DB.prepare(
        'SELECT telemetry_opt_out, email FROM customers WHERE id = ?'
      )
        .bind(customerId)
        .first();
      const decodedStatus = await Effect.runPromiseExit(
        decodeExtraRow(PrivacyStatusRowSchema, 'Privacy status row has an invalid shape', customer)
      );
      if (Exit.isFailure(decodedStatus)) {
        return errorResponse('Failed to load privacy status', 500);
      }
      const statusEmail = decodedStatus.value.email;
      const separatorIndex = statusEmail?.lastIndexOf('@') ?? -1;
      const emailDomain =
        statusEmail !== null &&
        statusEmail !== undefined &&
        separatorIndex > 0 &&
        separatorIndex < statusEmail.length - 1
          ? statusEmail.slice(separatorIndex + 1)
          : undefined;

      return jsonResponse({
        ...baseResponse,
        user_status: {
          telemetry_opt_out: Boolean(decodedStatus.value.telemetry_opt_out),
          email_on_file: emailDomain ? `***@${emailDomain}` : null,
        },
      });
    });
  } catch (error: unknown) {
    Sentry.captureException(error);
    return errorResponse('Failed to load privacy status', 500);
  }
}
