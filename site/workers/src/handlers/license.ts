// License validation handlers (for CLI activation)
import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import {
  type Env,
  jsonResponse,
  errorResponse,
  enforceRateLimit,
  rateLimitClientIp,
  logAudit,
  respondFromEffect,
  TIER_FEATURES,
  getAuthToken,
  validateSession,
} from '../api';
import {
  ActiveMachineRowSchema,
  ExistingMachineRowSchema,
  LicenseUsageRowSchema,
  ValidateLicenseFieldsSchema,
  type ValidateLicenseParseError,
  ValidateLicenseRowSchema,
  decodeRow,
  decodeRowArray,
  toValidateLicenseRequest,
  type ActiveMachineRow,
  type LicenseUsageRow,
  type ValidateLicenseRequest,
  type ValidateLicenseRow,
} from '../contracts/validate-license';
import { EmailAddress } from '../../../../shared/site-session';
import {
  AnalyticsBatchSchema,
  type LicenseOpsParseError,
  PublicLicenseRowSchema,
  ReportUsageRequestSchema,
  decodeLicenseOpsRow,
  type AnalyticsEvent,
  type ReportUsageRequest,
} from '../contracts/license-ops';
import { resolveTelemetryIngestion, type TelemetryIngestionDecision } from '../telemetry-policy';

const maskKey = (key: string) => {
  if (key.length <= 8) return `****${key.slice(-4)}`;
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
};

class LicenseHandlerError extends Error {
  constructor(
    readonly _tag:
      | 'InvalidLicenseError'
      | 'EmailRequiredError'
      | 'InvalidRequestUrlError'
      | 'LicenseKeyRequiredError'
      | 'ValidateLicenseStoreUnavailable'
      | 'LicenseJwtError'
      | 'InstallPingStoreUnavailable',
    message: string,
    readonly status: 400 | 401 | 500 | 503,
    override readonly cause?: unknown
  ) {
    super(message);
  }
}

type ValidateLicenseError = InvalidJsonBodyError | ValidateLicenseParseError | LicenseHandlerError;

type InvalidLicensePayload = {
  readonly valid: false;
  readonly error: string;
};

type ValidateLicensePayload =
  | InvalidLicensePayload
  | {
      readonly valid: true;
      readonly tier: string;
      readonly max_machines: number;
      readonly features: ReadonlyArray<string>;
      readonly customer: string;
      readonly expires_at: string | null;
      readonly token: string;
      readonly machines: ReadonlyArray<ActiveMachineRow>;
      readonly usage: ReadonlyArray<LicenseUsageRow>;
    };

function invalidLicense(error: string): InvalidLicensePayload {
  return { valid: false, error };
}

function featuresForTier(tier: string): ReadonlyArray<string> {
  if (tier === 'pro' || tier === 'team' || tier === 'enterprise') {
    return TIER_FEATURES[tier].features;
  }
  return TIER_FEATURES.free.features;
}

function maxMachinesFor(license: ValidateLicenseRow): number {
  if (license.max_seats !== undefined && license.max_seats !== null) {
    return license.max_seats;
  }
  if (license.max_machines !== undefined && license.max_machines !== null) {
    return license.max_machines;
  }
  return 1;
}

function storeUnavailable(operation: string, cause: unknown): LicenseHandlerError {
  return new LicenseHandlerError(
    'ValidateLicenseStoreUnavailable',
    `License store unavailable during ${operation}`,
    500,
    cause
  );
}

function runSql(
  db: D1Database,
  sql: string,
  params: ReadonlyArray<string | number | null>,
  operation: string
) {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(sql)
        .bind(...params)
        .run(),
    catch: cause => storeUnavailable(operation, cause),
  });
}

function queryFirst(
  db: D1Database,
  sql: string,
  params: ReadonlyArray<string | number>,
  operation: string
) {
  return runSql(db, sql, params, operation).pipe(Effect.map(result => result.results[0] ?? null));
}

function decodeInput(
  request: Request
): Effect.Effect<ValidateLicenseRequest, InvalidJsonBodyError | LicenseHandlerError> {
  // POST only: a GET would put the sole activation credential into edge and
  // proxy logs via the query string.
  if (request.method !== 'POST') {
    return Effect.fail(
      new LicenseHandlerError('InvalidRequestUrlError', 'Method not allowed', 400)
    );
  }
  return decodeJsonBody(request, ValidateLicenseFieldsSchema).pipe(
    Effect.flatMap(fields => {
      const body = toValidateLicenseRequest(fields);
      return body === null
        ? Effect.fail(
            new LicenseHandlerError('LicenseKeyRequiredError', 'License key required', 400)
          )
        : Effect.succeed(body);
    })
  );
}

function registerOrTouchMachine(
  env: Env,
  request: Request,
  license: ValidateLicenseRow,
  body: ValidateLicenseRequest
): Effect.Effect<InvalidLicensePayload | null, LicenseHandlerError | ValidateLicenseParseError> {
  const machineId = body.machineId;
  if (machineId === null) {
    return Effect.succeed(null);
  }
  return Effect.gen(function* () {
    const existingRow = yield* queryFirst(
      env.DB,
      `SELECT id FROM machines WHERE license_id = ? AND machine_id = ? AND is_active = 1`,
      [license.id, machineId],
      'findMachine'
    );
    if (existingRow !== null) {
      const existing = yield* decodeRow(
        ExistingMachineRowSchema,
        'Machine row has an invalid shape',
        existingRow
      );
      // COALESCE keeps the stored identity when the request omits one.
      yield* runSql(
        env.DB,
        `UPDATE machines SET last_seen_at = CURRENT_TIMESTAMP,
           user_name = COALESCE(?, user_name),
           user_email = COALESCE(?, user_email)
         WHERE id = ?`,
        [body.userName, body.userEmail, existing.id],
        'touchMachine'
      );
      return null;
    }

    // One guarded upsert covers first registration, reactivation after revoke,
    // and concurrent duplicate registration. Existing active rows may always
    // be touched; new or inactive rows proceed only while capacity remains.
    const maxMachines = maxMachinesFor(license);
    const seatResult = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          `INSERT INTO machines (id, license_id, machine_id, user_name, user_email, is_active)
           SELECT ?, ?, ?, ?, ?, 1
           WHERE EXISTS (
             SELECT 1 FROM machines
             WHERE license_id = ? AND machine_id = ? AND is_active = 1
           ) OR (
             SELECT COUNT(*) FROM machines WHERE license_id = ? AND is_active = 1
           ) < ?
           ON CONFLICT(license_id, machine_id) DO UPDATE SET
             is_active = 1,
             last_seen_at = CURRENT_TIMESTAMP,
             user_name = COALESCE(excluded.user_name, machines.user_name),
             user_email = COALESCE(excluded.user_email, machines.user_email)
           WHERE machines.is_active = 1 OR (
             SELECT COUNT(*) FROM machines WHERE license_id = ? AND is_active = 1
           ) < ?
           RETURNING id`
        )
          .bind(
            crypto.randomUUID(),
            license.id,
            machineId,
            body.userName,
            body.userEmail,
            license.id,
            machineId,
            license.id,
            maxMachines,
            license.id,
            maxMachines
          )
          .first(),
      catch: cause => storeUnavailable('registerMachine', cause),
    });
    if (seatResult === null) {
      yield* logAudit(
        env.DB,
        license.customer_id,
        'machine.seat_limit_reached',
        'machine',
        machineId,
        request
      );
      return invalidLicense(
        `Machine limit reached (${maxMachines}). Revoke a machine in your dashboard or upgrade.`
      );
    }
    yield* logAudit(
      env.DB,
      license.customer_id,
      'machine.registered',
      'machine',
      machineId,
      request
    );
    return null;
  });
}

/**
 * Validate a license key for CLI activation and mint a short-lived JWT.
 *
 * @param request - Incoming GET or POST.
 * @param env - Worker bindings.
 * @returns A validation payload, or a tagged validate-license error.
 */
function validateLicense(
  request: Request,
  env: Env
): Effect.Effect<ValidateLicensePayload, ValidateLicenseError> {
  return Effect.gen(function* () {
    const body = yield* decodeInput(request);
    const licenseRow = yield* queryFirst(
      env.DB,
      `SELECT l.id, l.customer_id, l.license_key, l.tier, l.status, l.max_seats, l.max_machines, l.expires_at,
              c.email, c.company as customer_name
       FROM licenses l
       JOIN customers c ON l.customer_id = c.id
       WHERE l.license_key = ?`,
      [body.licenseKey],
      'findLicense'
    );
    if (licenseRow === null) {
      return invalidLicense('Invalid license key');
    }
    const license = yield* decodeRow(
      ValidateLicenseRowSchema,
      'License row has an invalid shape',
      licenseRow
    );
    if (license.status !== 'active') {
      return invalidLicense(`License is ${license.status}`);
    }
    // Expiry: an unparsable stored date must fail closed (NaN comparisons are
    // always false, which would otherwise let the license live forever).
    if (license.expires_at !== null && license.expires_at.length > 0) {
      const expiresAt = new Date(license.expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        return invalidLicense('License has expired');
      }
    }
    const machineLimit = yield* registerOrTouchMachine(env, request, license, body);
    if (machineLimit !== null) {
      return machineLimit;
    }

    if (env.JWT_PRIVATE_KEY.length === 0) {
      return yield* Effect.fail(
        new LicenseHandlerError('LicenseJwtError', 'Internal server error', 500)
      );
    }
    const token = yield* Effect.tryPromise({
      try: () => generateLicenseJWT(license, body.machineId, env.JWT_PRIVATE_KEY),
      catch: cause =>
        new LicenseHandlerError('LicenseJwtError', 'Internal server error', 500, cause),
    });

    let machines: ReadonlyArray<ActiveMachineRow> = [];
    if (body.machineId !== null) {
      const machineResult = yield* runSql(
        env.DB,
        `SELECT machine_id, hostname, os, arch, omg_version, is_active, first_seen_at, last_seen_at
         FROM machines WHERE license_id = ? AND machine_id = ?`,
        [license.id, body.machineId],
        'listCurrentMachine'
      );
      machines = yield* decodeRowArray(
        ActiveMachineRowSchema,
        'Machine rows have an invalid shape',
        machineResult.results
      );
    }
    const usageResult = yield* runSql(
      env.DB,
      `SELECT date, commands_run, packages_installed, packages_searched, runtimes_switched,
              sbom_generated, vulnerabilities_found, time_saved_ms
       FROM usage_daily WHERE license_id = ? AND date >= date('now', '-30 days')
       ORDER BY date DESC`,
      [license.id],
      'listUsage'
    );
    const usage = yield* decodeRowArray(
      LicenseUsageRowSchema,
      'Usage rows have an invalid shape',
      usageResult.results
    );
    return {
      valid: true as const,
      tier: license.tier,
      max_machines: maxMachinesFor(license),
      features: [...featuresForTier(license.tier)],
      customer: license.customer_name || license.email,
      expires_at: license.expires_at,
      token,
      machines,
      usage,
    };
  });
}

function errorStatus(error: { readonly _tag: string }): number {
  if (error instanceof LicenseHandlerError) {
    return error.status;
  }
  return error._tag === 'InvalidJsonBodyError' ? 400 : 500;
}

/**
 * HTTP adapter for `GET|POST /api/validate-license`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON validation payload or a mapped error response.
 */
export async function handleValidateLicense(request: Request, env: Env): Promise<Response> {
  // License keys are the sole activation credential; throttle per-IP to blunt
  // key brute-force attempts. Header-less requests share one fail-safe bucket.
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `validate_license:${rateLimitClientIp(request)}`
  );
  if (limited !== null) {
    return limited;
  }
  return respondFromEffect(validateLicense(request, env), error => {
    const status = errorStatus(error);
    // Uniform error channel with report-usage: internal store details never
    // leak through 5xx messages.
    return errorResponse(status < 500 ? error.message : 'Internal server error', status);
  });
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function optionalNumber(value: number | undefined): number {
  return value === undefined ? 0 : value;
}

function optionalText(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

/**
 * Build an idempotent daily-metric increment for `analytics_daily`.
 *
 * @param db - The D1 database handle.
 * @param today - UTC date the metric is attributed to.
 * @param metric - Metric name to increment.
 * @param dimension - Metric dimension, or `'all'` when undimensioned.
 * @param count - Amount to add.
 */
function incrementDailyMetric(
  db: D1Database,
  today: string,
  metric: string,
  dimension: string | null,
  count: number
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO analytics_daily (date, metric, dimension, value)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date, metric, dimension) DO UPDATE SET value = value + ?`
    )
    .bind(today, metric, dimension, count, count);
}

function lookupPublicLicense(
  request: Request,
  env: Env
): Effect.Effect<
  | { readonly found: false }
  | {
      readonly found: true;
      readonly license_key: string;
      readonly tier: string;
      readonly status: string;
      readonly expires_at: string | null;
      readonly max_machines: number | null;
      readonly used_machines: number;
    },
  LicenseHandlerError | LicenseOpsParseError
> {
  return Effect.gen(function* () {
    const url = URL.parse(request.url);
    if (url === null) {
      return yield* Effect.fail(
        new LicenseHandlerError('InvalidRequestUrlError', 'Invalid request URL', 400)
      );
    }
    const rawEmail = url.searchParams.get('email');
    if (!rawEmail) {
      return yield* Effect.fail(
        new LicenseHandlerError('EmailRequiredError', 'Email required', 400)
      );
    }
    const email = yield* Schema.decodeUnknown(EmailAddress)(rawEmail).pipe(
      Effect.mapError(() => new LicenseHandlerError('EmailRequiredError', 'Email required', 400))
    );
    const licenseRow = yield* queryFirst(
      env.DB,
      `SELECT l.license_key, l.tier, l.status, l.expires_at,
              l.max_seats as max_machines,
              (SELECT COUNT(*) FROM machines m
               WHERE m.license_id = l.id AND m.is_active = 1) as used_machines
       FROM licenses l
       JOIN customers c ON l.customer_id = c.id
       WHERE c.email = ?
       ORDER BY CASE WHEN l.status = 'active' THEN 0 ELSE 1 END,
                l.created_at DESC, l.id DESC
       LIMIT 1`,
      [email],
      'publicLicense'
    );
    if (licenseRow === null) {
      return { found: false as const };
    }
    const license = yield* decodeLicenseOpsRow(
      PublicLicenseRowSchema,
      'Public license row has an invalid shape',
      licenseRow
    );
    return {
      found: true as const,
      license_key: maskKey(license.license_key),
      tier: license.tier,
      status: license.status,
      expires_at: license.expires_at,
      max_machines: license.max_machines,
      used_machines: license.used_machines,
    };
  });
}

/**
 * HTTP adapter for `GET /api/get-license`.
 *
 * @param request - Incoming GET with `email` query.
 * @param env - Worker bindings.
 * @returns A masked public license payload, or a mapped error response.
 */
export async function handleGetLicense(request: Request, env: Env): Promise<Response> {
  // Require a valid session to prevent anonymous email-keyed enumeration.
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Unauthorized', 401);
  }
  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Unauthorized', 401);
  }
  // Ownership: the session user may only look up their own license. Prevents
  // authenticated cross-tenant enumeration by email.
  const requestedEmail = URL.parse(request.url)?.searchParams.get('email') ?? null;
  if (requestedEmail !== null && requestedEmail.toLowerCase() !== auth.user.email.toLowerCase()) {
    return errorResponse('Forbidden', 403);
  }
  return respondFromEffect(lookupPublicLicense(request, env), error =>
    errorResponse(error.message, errorStatus(error))
  );
}

function reportUsage(
  request: Request,
  env: Env
): Effect.Effect<
  { readonly success: true },
  InvalidJsonBodyError | LicenseHandlerError | LicenseOpsParseError
> {
  return Effect.gen(function* () {
    const body = yield* decodeJsonBody(request, ReportUsageRequestSchema);
    const policy = yield* resolveTelemetryIngestion(env.DB, body.license_key).pipe(
      Effect.mapError(cause => storeUnavailable('reportTelemetryPolicy', cause))
    );
    if (policy._tag === 'invalidLicense') {
      return yield* Effect.fail(
        new LicenseHandlerError('InvalidLicenseError', 'Invalid license', 401)
      );
    }
    if (policy._tag === 'optedOut') {
      return { success: true as const };
    }
    const today = utcDate();
    yield* runSql(
      env.DB,
      `INSERT INTO usage_daily (id, license_id, date, commands_run, packages_installed, packages_searched, runtimes_switched, sbom_generated, vulnerabilities_found, time_saved_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(license_id, date) DO UPDATE SET
         commands_run = MAX(usage_daily.commands_run, excluded.commands_run),
         packages_installed = MAX(usage_daily.packages_installed, excluded.packages_installed),
         packages_searched = MAX(usage_daily.packages_searched, excluded.packages_searched),
         runtimes_switched = MAX(usage_daily.runtimes_switched, excluded.runtimes_switched),
         sbom_generated = MAX(usage_daily.sbom_generated, excluded.sbom_generated),
         vulnerabilities_found = MAX(usage_daily.vulnerabilities_found, excluded.vulnerabilities_found),
         time_saved_ms = MAX(usage_daily.time_saved_ms, excluded.time_saved_ms)`,
      [
        crypto.randomUUID(),
        policy.licenseId,
        today,
        optionalNumber(body.commands_run),
        optionalNumber(body.packages_installed),
        optionalNumber(body.packages_searched),
        optionalNumber(body.runtimes_switched),
        optionalNumber(body.sbom_generated),
        optionalNumber(body.vulnerabilities_found),
        optionalNumber(body.time_saved_ms),
      ],
      'upsertUsage'
    );
    yield* reportMachineUsage(env, policy.licenseId, policy.customerId, today, body);
    return { success: true as const };
  });
}

function reportMachineUsage(
  env: Env,
  licenseId: string,
  customerId: string,
  today: string,
  body: ReportUsageRequest
): Effect.Effect<void, LicenseHandlerError> {
  // Collect every per-machine, package, runtime, and achievement upsert into a
  // single D1 batch: one network round trip instead of one per entry.
  const statements: D1PreparedStatement[] = [];

  const machineId = body.machine_id;
  if (machineId !== undefined && machineId.length > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO usage_member_daily (id, license_id, machine_id, date, commands_run, packages_installed, runtimes_switched, time_saved_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(license_id, machine_id, date) DO UPDATE SET
           commands_run = MAX(usage_member_daily.commands_run, excluded.commands_run),
           packages_installed = MAX(usage_member_daily.packages_installed, excluded.packages_installed),
           runtimes_switched = MAX(usage_member_daily.runtimes_switched, excluded.runtimes_switched),
           time_saved_ms = MAX(usage_member_daily.time_saved_ms, excluded.time_saved_ms)`
      ).bind(
        crypto.randomUUID(),
        licenseId,
        machineId,
        today,
        optionalNumber(body.commands_run),
        optionalNumber(body.packages_installed),
        optionalNumber(body.runtimes_switched),
        optionalNumber(body.time_saved_ms)
      )
    );
    statements.push(
      env.DB.prepare(
        `UPDATE machines SET
           last_seen_at = CURRENT_TIMESTAMP,
           hostname = COALESCE(?, hostname),
           os = COALESCE(?, os),
           arch = COALESCE(?, arch),
           omg_version = COALESCE(?, omg_version)
         WHERE license_id = ? AND machine_id = ?`
      ).bind(
        optionalText(body.hostname),
        optionalText(body.os),
        optionalText(body.arch),
        optionalText(body.omg_version),
        licenseId,
        machineId
      )
    );
  }

  const packages = body.installed_packages;
  if (packages !== undefined) {
    for (const [pkg, count] of Object.entries(packages)) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO usage_package_daily (license_id, date, package_name, usage_count)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(license_id, date, package_name) DO UPDATE SET
             usage_count = MAX(usage_package_daily.usage_count, excluded.usage_count)`
        ).bind(licenseId, today, pkg, count)
      );
    }
  }

  const runtimes = body.runtime_usage_counts;
  if (runtimes !== undefined) {
    for (const [runtime, count] of Object.entries(runtimes)) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO usage_runtime_daily (license_id, date, runtime, usage_count)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(license_id, date, runtime) DO UPDATE SET
             usage_count = MAX(usage_runtime_daily.usage_count, excluded.usage_count)`
        ).bind(licenseId, today, runtime, count)
      );
    }
  }

  const achievements = body.achievements;
  if (achievements !== undefined) {
    for (const achievement of achievements) {
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO achievements (id, customer_id, achievement_id) VALUES (?, ?, ?)`
        ).bind(crypto.randomUUID(), customerId, achievement)
      );
    }
  }

  if (statements.length === 0) {
    return Effect.void;
  }
  return Effect.tryPromise({
    try: () => env.DB.batch(statements),
    catch: cause => storeUnavailable('reportMachineUsageBatch', cause),
  }).pipe(Effect.asVoid);
}

/**
 * HTTP adapter for `POST /api/report-usage`.
 *
 * @param request - Incoming POST with JSON body.
 * @param env - Worker bindings.
 * @returns JSON success payload or a mapped error response.
 */
export async function handleReportUsage(request: Request, env: Env): Promise<Response> {
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `report_usage:${rateLimitClientIp(request)}`
  );
  if (limited !== null) {
    return limited;
  }
  return respondFromEffect(reportUsage(request, env), error => {
    const status = errorStatus(error);
    return errorResponse(status < 500 ? error.message : 'Internal server error', status);
  });
}

// Handle install ping (anonymous telemetry)

/** The install ping payload sent by the CLI on first run. */
const InstallPingBodySchema = Schema.Struct({
  install_id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  version: Schema.optional(Schema.String.pipe(Schema.maxLength(64))),
  platform: Schema.optional(Schema.String.pipe(Schema.maxLength(64))),
  backend: Schema.optional(Schema.String.pipe(Schema.maxLength(64))),
});

/**
 * HTTP adapter for anonymous install telemetry.
 *
 * @param request - Incoming POST with JSON body.
 * @param env - Worker bindings.
 * @returns JSON success payload or a mapped error response.
 */
export async function handleInstallPing(request: Request, env: Env): Promise<Response> {
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `install_ping:${rateLimitClientIp(request)}`
  );
  if (limited?.status === 429) {
    return jsonResponse({ success: true as const, message: 'Install recorded' });
  }
  if (limited !== null) {
    return limited;
  }

  return respondFromEffect(
    Effect.gen(function* () {
      const body = yield* decodeJsonBody(request, InstallPingBodySchema);
      yield* Effect.tryPromise({
        try: () =>
          env.DB.prepare(
            `INSERT OR IGNORE INTO install_stats (id, install_id, version, platform, backend, created_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
          )
            .bind(
              crypto.randomUUID(),
              body.install_id,
              body.version ?? null,
              body.platform ?? null,
              body.backend ?? null
            )
            .run(),
        catch: cause =>
          new LicenseHandlerError(
            'InstallPingStoreUnavailable',
            'Internal server error',
            500,
            cause
          ),
      });
      return { success: true as const, message: 'Install recorded' };
    }),
    error =>
      error._tag === 'InvalidJsonBodyError'
        ? errorResponse('Invalid JSON body', 400)
        : errorResponse('Internal server error', 500)
  );
}

// Generate JWT for offline license validation
async function generateLicenseJWT(
  license: ValidateLicenseRow,
  machineId: string | null,
  privateKey: string
): Promise<string> {
  const header = { alg: 'EdDSA', kid: 'omg-license-ed25519-v1', typ: 'JWT' } as const;
  const now = Math.floor(Date.now() / 1000);
  const maximumExpiry = now + 60 * 60;
  const licenseExpiry =
    license.expires_at === null
      ? maximumExpiry
      : Math.floor(new Date(license.expires_at).getTime() / 1000);
  const payload = {
    iss: 'https://omg-api.latham.cloud',
    aud: 'omg-cli',
    sub: license.customer_id,
    tier: license.tier,
    features: [...featuresForTier(license.tier)],
    exp: Math.min(maximumExpiry, licenseExpiry),
    iat: now,
    mid: machineId,
    lic: license.license_key,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const signature = await eddsaSign(privateKey, data);
  return `${data}.${signature}`;
}

function base64UrlEncode(data: Uint8Array | string): string {
  let binary: string;
  if (data instanceof Uint8Array) {
    // Chunked conversion: spreading large buffers into String.fromCharCode
    // overflows the call stack.
    binary = '';
    for (let i = 0; i < data.length; i += 0x8000) {
      binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    }
  } else {
    binary = data;
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(data: string): string {
  const padded = data + '==='.slice(0, (4 - (data.length % 4)) % 4);
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

async function eddsaSign(privateKeyDer: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = base64UrlDecode(
    privateKeyDer.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  );
  const keyBuffer = new Uint8Array(keyData.length);
  for (let i = 0; i < keyData.length; i++) {
    keyBuffer[i] = keyData.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey('pkcs8', keyBuffer, { name: 'Ed25519' }, false, [
    'sign',
  ]);

  const signature = await crypto.subtle.sign('Ed25519', key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

function analyticsPropertyString(
  properties: AnalyticsEvent['properties'],
  key: string,
  fallback: string
): string {
  if (properties === undefined) {
    return fallback;
  }
  const value = Object.hasOwn(properties, key) ? properties[key] : undefined;
  if (value === undefined || value === null) {
    return fallback;
  }
  const decoded = Schema.decodeUnknownEither(Schema.String.pipe(Schema.minLength(1)))(value);
  return decoded._tag === 'Right' ? decoded.right : fallback;
}

function ingestAnalytics(
  request: Request,
  env: Env
): Effect.Effect<
  { readonly success: true; readonly processed: number },
  InvalidJsonBodyError | LicenseHandlerError
> {
  return Effect.gen(function* () {
    const rateLimiter = env.API_RATE_LIMITER;
    if (rateLimiter === undefined) {
      return yield* Effect.fail(
        new LicenseHandlerError(
          'ValidateLicenseStoreUnavailable',
          'Analytics rate limiting unavailable',
          503
        )
      );
    }
    const rl = yield* Effect.tryPromise({
      try: () => rateLimiter.limit({ key: `analytics:${rateLimitClientIp(request)}` }),
      catch: cause => storeUnavailable('analyticsRateLimit', cause),
    });
    if (!rl.success) {
      return { success: true as const, processed: 0 };
    }

    // decodeJsonBody enforces the byte cap on the actual stream; no
    // Content-Length header trust is needed.
    const body = yield* decodeJsonBody(request, AnalyticsBatchSchema);
    const requestedEvents = body.events === undefined ? [] : body.events;
    if (requestedEvents.length === 0) {
      return { success: true as const, processed: 0 };
    }

    const decisionsByLicenseKey = new Map<string, TelemetryIngestionDecision>();
    const events: AnalyticsEvent[] = [];
    for (const event of requestedEvents) {
      // Product analytics are attribution-sensitive. Anonymous events are
      // discarded because any caller could otherwise poison global metrics.
      if (event.license_key === undefined) {
        continue;
      }

      let decision = decisionsByLicenseKey.get(event.license_key);
      if (decision === undefined) {
        decision = yield* resolveTelemetryIngestion(env.DB, event.license_key).pipe(
          Effect.mapError(cause => storeUnavailable('analyticsTelemetryPolicy', cause))
        );
        decisionsByLicenseKey.set(event.license_key, decision);
      }
      if (decision._tag === 'allowed') {
        events.push(event);
      }
    }
    if (events.length === 0) {
      return { success: true as const, processed: 0 };
    }

    const today = utcDate();
    const statements: D1PreparedStatement[] = [];
    for (const event of events) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO analytics_events (id, event_type, event_name, properties, timestamp, session_id, machine_id, license_key, version, platform, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
        ).bind(
          crypto.randomUUID(),
          event.event_type,
          event.event_name,
          JSON.stringify(event.properties === undefined ? {} : event.properties),
          event.timestamp,
          event.session_id,
          event.machine_id,
          optionalText(event.license_key),
          event.version,
          event.platform,
          event.duration_ms === undefined ? null : event.duration_ms
        )
      );
      if (event.event_type === 'command') {
        statements.push(incrementDailyMetric(env.DB, today, 'commands', event.event_name, 1));
        statements.push(incrementDailyMetric(env.DB, today, 'total_commands', 'all', 1));
        statements.push(incrementDailyMetric(env.DB, today, 'platform', event.platform, 1));
        statements.push(incrementDailyMetric(env.DB, today, 'version', event.version, 1));
      }
      if (event.event_type === 'error') {
        const errorMsg = analyticsPropertyString(event.properties, 'message', 'unknown error');
        statements.push(
          env.DB.prepare(
            `INSERT INTO analytics_errors (error_message, occurrences, last_occurred_at)
             VALUES (?, 1, CURRENT_TIMESTAMP)
             ON CONFLICT(error_message) DO UPDATE SET occurrences = occurrences + 1, last_occurred_at = CURRENT_TIMESTAMP`
          ).bind(errorMsg)
        );
        const errorType = analyticsPropertyString(event.properties, 'error_type', 'unknown');
        statements.push(incrementDailyMetric(env.DB, today, 'errors', errorType, 1));
      }
    }
    yield* Effect.tryPromise({
      try: () => env.DB.batch(statements),
      catch: cause => storeUnavailable('analyticsBatch', cause),
    });
    const uniqueMachines = [...new Set(events.map(event => event.machine_id))];
    for (const machineId of uniqueMachines) {
      yield* runSql(
        env.DB,
        `INSERT OR IGNORE INTO analytics_active_users (date, machine_id) VALUES (?, ?)`,
        [today, machineId],
        'analyticsActiveUser'
      );
    }
    return { success: true as const, processed: events.length };
  });
}

/**
 * HTTP adapter for `POST /api/analytics`.
 *
 * @param request - Incoming POST with a JSON event batch.
 * @param env - Worker bindings.
 * @returns JSON processed count or a mapped error response.
 */
export async function handleAnalytics(request: Request, env: Env): Promise<Response> {
  return respondFromEffect(
    ingestAnalytics(request, env),
    error =>
      error._tag === 'InvalidJsonBodyError'
        ? errorResponse('Invalid JSON body', 400)
        : errorResponse('Failed to process analytics', 500),
    'Failed to process analytics'
  );
}
