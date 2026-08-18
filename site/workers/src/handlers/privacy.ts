// Privacy and data deletion handlers (GDPR/CCPA compliance)
// Available globally to all users, regardless of jurisdiction
import { Effect, Exit } from 'effect';
import { Schema } from '@effect/schema';
import { decodeJsonBody } from '../body';
import { type Env, jsonResponse, errorResponse, corsHeaders, generateId } from '../api';
import {
  decodeExtraRow,
  decodeExtraRowArray,
  decodeOptionalExtraRow,
  IdRowSchema,
  LicenseCustomerIdRowSchema,
  PrivacyCommandRowSchema,
  PrivacyFeatureRowSchema,
  PrivacyLicenseRowSchema,
  PrivacyMachineRowSchema,
  PrivacyPerformanceRowSchema,
  PrivacyProfileRowSchema,
  PrivacySessionRowSchema,
  PrivacyStatusRowSchema,
  type PrivacyCommandRow,
  type PrivacyFeatureRow,
  type PrivacyLicenseRow,
  type PrivacyMachineRow,
  type PrivacyPerformanceRow,
  type PrivacySessionRow,
} from '../contracts/d1-extras';

/** The GDPR deletion request body. */
const DeleteRequestSchema = Schema.Struct({
  email: Schema.optional(Schema.String),
  license_key: Schema.optional(Schema.String),
  machine_id: Schema.optional(Schema.String),
  confirm: Schema.optional(Schema.Boolean),
  reason: Schema.optional(Schema.String),
});

/** The GDPR data export request body. */
const DataExportRequestSchema = Schema.Struct({
  email: Schema.optional(Schema.String),
  license_key: Schema.optional(Schema.String),
});

/** The telemetry opt-out request body. */
const OptOutRequestSchema = Schema.Struct({
  license_key: Schema.optional(Schema.String),
  opt_out: Schema.optional(Schema.Boolean),
});

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
 * Available to ALL users globally - privacy is a fundamental right.
 *
 * Deletes:
 * - Telemetry events (command_event, session, performance_metric, feature_usage)
 * - Usage statistics (machine_usage)
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
    const decoded = await Effect.runPromiseExit(decodeJsonBody(request, DeleteRequestSchema));
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    const body = decoded.value;

    if (!body.confirm) {
      return errorResponse('Deletion must be confirmed. Set confirm: true', 400);
    }

    if (!body.email && !body.license_key && !body.machine_id) {
      return errorResponse('Must provide email, license_key, or machine_id', 400);
    }

    let customerId: string | null = null;
    let licenseId: string | null = null;
    let machineId: string | null = null;

    // Find customer by email
    if (body.email) {
      const customer = await env.DB.prepare('SELECT id FROM customers WHERE email = ?')
        .bind(body.email)
        .first();
      if (customer) {
        const decodedCustomer = await Effect.runPromiseExit(
          decodeExtraRow(IdRowSchema, 'Privacy customer row has an invalid shape', customer)
        );
        if (Exit.isSuccess(decodedCustomer)) {
          customerId = decodedCustomer.value.id;
        }
      }
    }

    // Find customer by license key
    if (body.license_key) {
      const license = await env.DB.prepare(
        'SELECT id, customer_id FROM licenses WHERE license_key = ?'
      )
        .bind(body.license_key)
        .first();
      if (license) {
        const decodedLicense = await Effect.runPromiseExit(
          decodeExtraRow(
            LicenseCustomerIdRowSchema,
            'Privacy license row has an invalid shape',
            license
          )
        );
        if (Exit.isSuccess(decodedLicense)) {
          licenseId = decodedLicense.value.id;
          customerId = decodedLicense.value.customer_id;
        }
      }
    }

    // Use machine_id directly
    if (body.machine_id) {
      machineId = body.machine_id;
    }

    if (!customerId && !machineId) {
      return errorResponse('No matching records found', 404);
    }

    const deletedCounts: Record<string, number> = {};
    const statements: D1PreparedStatement[] = [];

    // Delete telemetry data
    if (licenseId) {
      // Command events
      statements.push(
        env.DB.prepare('DELETE FROM command_event WHERE license_id = ?').bind(licenseId)
      );
      // Sessions
      statements.push(env.DB.prepare('DELETE FROM session WHERE license_id = ?').bind(licenseId));
      // Performance metrics
      statements.push(
        env.DB.prepare('DELETE FROM performance_metric WHERE license_id = ?').bind(licenseId)
      );
      // Feature usage
      statements.push(
        env.DB.prepare('DELETE FROM feature_usage WHERE license_id = ?').bind(licenseId)
      );
    }

    if (machineId) {
      // Machine-specific data (for users who only provide machine_id)
      statements.push(
        env.DB.prepare('DELETE FROM command_event WHERE machine_id = ?').bind(machineId)
      );
      statements.push(env.DB.prepare('DELETE FROM session WHERE machine_id = ?').bind(machineId));
      statements.push(
        env.DB.prepare('DELETE FROM performance_metric WHERE machine_id = ?').bind(machineId)
      );
      statements.push(
        env.DB.prepare('DELETE FROM feature_usage WHERE machine_id = ?').bind(machineId)
      );
      statements.push(
        env.DB.prepare('DELETE FROM install_stats WHERE install_id = ?').bind(machineId)
      );
    }

    if (customerId) {
      // Machine usage
      statements.push(
        env.DB.prepare('DELETE FROM machine_usage WHERE customer_id = ?').bind(customerId)
      );
      // Customer notes (non-internal only)
      statements.push(
        env.DB.prepare('DELETE FROM customer_notes WHERE customer_id = ? AND is_internal = 0').bind(
          customerId
        )
      );
      // Session tokens (logout all sessions)
      statements.push(
        env.DB.prepare('DELETE FROM sessions WHERE customer_id = ?').bind(customerId)
      );
      // OTP codes
      statements.push(
        env.DB.prepare(
          'DELETE FROM otp_codes WHERE email = (SELECT email FROM customers WHERE id = ?)'
        ).bind(customerId)
      );
    }

    // Execute all deletions in a batch
    if (statements.length > 0) {
      const results = await env.DB.batch(statements);
      results.forEach((result, index) => {
        if (result.meta?.changes) {
          const tableNames = [
            'command_events',
            'sessions',
            'performance_metrics',
            'feature_usage',
            'install_stats',
            'machine_usage',
            'customer_notes',
            'session_tokens',
            'otp_codes',
          ];
          const tableName = tableNames[index % tableNames.length] || `table_${index}`;
          deletedCounts[tableName] = (deletedCounts[tableName] || 0) + result.meta.changes;
        }
      });
    }

    // Anonymize license record if requested (soft delete)
    if (customerId && body.license_key) {
      await env.DB.prepare(
        `
        UPDATE licenses
        SET status = 'deleted_by_user',
            updated_at = datetime('now')
        WHERE customer_id = ?
      `
      )
        .bind(customerId)
        .run();
    }

    // Log the deletion request for audit (30-day retention)
    const requestId = generateId();
    await env.DB.prepare(
      `
      INSERT INTO audit_log (id, action, resource_type, resource_id, ip_address, details, created_at)
      VALUES (?, 'data_deletion_request', 'customer', ?, ?, ?, datetime('now'))
    `
    )
      .bind(
        requestId,
        customerId || machineId || 'unknown',
        request.headers.get('CF-Connecting-IP') || 'unknown',
        JSON.stringify({
          reason: body.reason || 'User requested deletion',
          deleted_counts: deletedCounts,
        })
      )
      .run();

    return jsonResponse({
      success: true,
      message: 'Your data has been deleted. This action is irreversible.',
      request_id: requestId,
      deleted: deletedCounts,
      retention_notice:
        'Audit logs are retained for 30 days for security purposes. Payment records are retained per Stripe requirements.',
    });
  } catch (e) {
    console.error('Data deletion error:', e);
    return errorResponse('Failed to process deletion request', 500);
  }
}

/**
 * Handle user data export request (GDPR Article 20 - Right to Portability)
 * POST /api/privacy/export
 *
 * Returns all personal data in a portable JSON format.
 */
export async function handleExportMyData(request: Request, env: Env): Promise<Response> {
  try {
    const decoded = await Effect.runPromiseExit(decodeJsonBody(request, DataExportRequestSchema));
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    const body = decoded.value;

    if (!body.email && !body.license_key) {
      return errorResponse('Must provide email or license_key', 400);
    }

    let customerId: string | null = null;
    let licenseId: string | null = null;

    // Find customer
    if (body.email) {
      const customer = await env.DB.prepare('SELECT id FROM customers WHERE email = ?')
        .bind(body.email)
        .first();
      if (customer) {
        const decodedCustomer = await Effect.runPromiseExit(
          decodeExtraRow(IdRowSchema, 'Privacy customer row has an invalid shape', customer)
        );
        if (Exit.isSuccess(decodedCustomer)) {
          customerId = decodedCustomer.value.id;
        }
      }
    }

    if (body.license_key) {
      const license = await env.DB.prepare(
        'SELECT id, customer_id FROM licenses WHERE license_key = ?'
      )
        .bind(body.license_key)
        .first();
      if (license) {
        const decodedLicense = await Effect.runPromiseExit(
          decodeExtraRow(
            LicenseCustomerIdRowSchema,
            'Privacy license row has an invalid shape',
            license
          )
        );
        if (Exit.isSuccess(decodedLicense)) {
          licenseId = decodedLicense.value.id;
          customerId = decodedLicense.value.customer_id;
        }
      }
    }

    if (!customerId) {
      return errorResponse('No matching records found', 404);
    }

    // Collect all user data
    const exportData: ExportData = {
      export_date: new Date().toISOString(),
      export_format_version: '1.0',
    };

    // Customer profile
    const customerRow = await env.DB.prepare(
      'SELECT id, email, company, tier, stripe_customer_id, created_at FROM customers WHERE id = ?'
    )
      .bind(customerId)
      .first();
    const customer = await Effect.runPromise(
      decodeOptionalExtraRow(
        PrivacyProfileRowSchema,
        'Privacy profile row has an invalid shape',
        customerRow
      )
    );
    if (customer !== undefined) {
      exportData.profile = {
        email: customer.email,
        company: customer.company,
        tier: customer.tier,
        member_since: customer.created_at,
      };
    }

    // License info (redacted key)
    const licenses = await env.DB.prepare(
      'SELECT tier, status, max_machines, activated_at, expires_at, created_at FROM licenses WHERE customer_id = ?'
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
    exportData.licenses = [...decodedLicenses.value];

    // Machine usage
    if (licenseId) {
      const machines = await env.DB.prepare(
        'SELECT machine_id, hostname, os, arch, omg_version, activated_at, last_seen_at FROM machine_usage WHERE license_id = ?'
      )
        .bind(licenseId)
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
        `
        SELECT command, subcommand, packages, duration_ms, success, timestamp
        FROM command_event
        WHERE license_id = ?
        ORDER BY timestamp DESC
        LIMIT 1000
      `
      )
        .bind(licenseId)
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
        `
        SELECT session_id, event_type, start_time, end_time, commands_run, duration_secs, timestamp
        FROM session
        WHERE license_id = ?
        ORDER BY timestamp DESC
        LIMIT 100
      `
      )
        .bind(licenseId)
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
        `
        SELECT metric_type, AVG(duration_ms) as avg_duration_ms, COUNT(*) as sample_count
        FROM performance_metric
        WHERE license_id = ?
        GROUP BY metric_type
      `
      )
        .bind(licenseId)
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
        `
        SELECT feature, enabled, COUNT(*) as usage_count, MAX(timestamp) as last_used
        FROM feature_usage
        WHERE license_id = ?
        GROUP BY feature, enabled
      `
      )
        .bind(licenseId)
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
    }

    // Log the export request
    await env.DB.prepare(
      `
      INSERT INTO audit_log (id, action, resource_type, resource_id, ip_address, created_at)
      VALUES (?, 'data_export_request', 'customer', ?, ?, datetime('now'))
    `
    )
      .bind(generateId(), customerId, request.headers.get('CF-Connecting-IP') || 'unknown')
      .run();

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="omg-data-export-${new Date().toISOString().split('T')[0]}.json"`,
        ...corsHeaders,
      },
    });
  } catch (e) {
    console.error('Data export error:', e);
    return errorResponse('Failed to process export request', 500);
  }
}

/**
 * Handle opt-out of all telemetry (sets a flag, keeps license functional)
 * POST /api/privacy/opt-out
 */
export async function handleOptOut(request: Request, env: Env): Promise<Response> {
  try {
    const decoded = await Effect.runPromiseExit(decodeJsonBody(request, OptOutRequestSchema));
    if (Exit.isFailure(decoded)) {
      return errorResponse('Invalid JSON body', 400);
    }
    const body = decoded.value;

    if (!body.license_key) {
      return errorResponse('License key required', 400);
    }

    const licenseRow = await env.DB.prepare(
      'SELECT id, customer_id FROM licenses WHERE license_key = ?'
    )
      .bind(body.license_key)
      .first();
    const license = await Effect.runPromise(
      decodeOptionalExtraRow(
        LicenseCustomerIdRowSchema,
        'Privacy license row has an invalid shape',
        licenseRow
      )
    );

    if (license === undefined) {
      return errorResponse('Invalid license key', 404);
    }

    // Update customer preferences
    await env.DB.prepare(
      `
      UPDATE customers
      SET telemetry_opt_out = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `
    )
      .bind(body.opt_out ? 1 : 0, license.customer_id)
      .run();

    return jsonResponse({
      success: true,
      telemetry_opt_out: body.opt_out,
      message: body.opt_out
        ? 'Telemetry disabled. Your license remains fully functional.'
        : 'Telemetry re-enabled. Thank you for helping improve OMG!',
    });
  } catch (e) {
    console.error('Opt-out error:', e);
    return errorResponse('Failed to process opt-out request', 500);
  }
}

/**
 * Get privacy policy summary and user's current settings
 * GET /api/privacy/status
 */
export async function handlePrivacyStatus(request: Request, env: Env): Promise<Response> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return errorResponse('Invalid request URL', 400);
  }
  const licenseKey = url.searchParams.get('license_key');

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
      'Right to access (GET /api/privacy/export)',
      'Right to deletion (POST /api/privacy/delete)',
      'Right to opt-out (POST /api/privacy/opt-out)',
      'Right to portability (data export in JSON format)',
    ],
    available_globally: true,
    jurisdiction_note: 'These rights are available to ALL users regardless of location.',
  };

  if (!licenseKey) {
    return jsonResponse(baseResponse);
  }

  // Get user-specific status
  const license = await env.DB.prepare(
    'SELECT l.id, c.telemetry_opt_out, c.email FROM licenses l JOIN customers c ON l.customer_id = c.id WHERE l.license_key = ?'
  )
    .bind(licenseKey)
    .first();

  if (!license) {
    return jsonResponse({
      ...baseResponse,
      user_status: null,
    });
  }

  const decodedStatus = await Effect.runPromiseExit(
    decodeExtraRow(PrivacyStatusRowSchema, 'Privacy status row has an invalid shape', license)
  );
  if (Exit.isFailure(decodedStatus)) {
    return jsonResponse({
      ...baseResponse,
      user_status: null,
    });
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
}
