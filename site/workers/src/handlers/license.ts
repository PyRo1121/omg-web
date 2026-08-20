// License validation handlers (for CLI activation)
import { Cause, Effect, Exit, Option } from 'effect';
import { Schema } from '@effect/schema';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import { type Env, jsonResponse, errorResponse, generateId, logAudit, TIER_FEATURES } from '../api';
import { casesHandled } from '../prelude';
import {
  ActiveMachineRowSchema,
  ExistingMachineRowSchema,
  LicenseUsageRowSchema,
  MachineCountRowSchema,
  ValidateLicenseFieldsSchema,
  ValidateLicenseParseError,
  ValidateLicenseRowSchema,
  decodeRow,
  decodeRowArray,
  decodeValidateLicenseFields,
  toValidateLicenseRequest,
  type ValidateLicenseFields,
  type ValidateLicenseRequest,
  type ValidateLicenseRow,
} from '../contracts/validate-license';
import { EmailAddress } from '../contracts/site-session';
import {
  AnalyticsBatchSchema,
  CountRowSchema,
  LicenseOpsParseError,
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

/** The posted license key is missing or inactive. */
export class InvalidLicenseError extends Error {
  readonly _tag = 'InvalidLicenseError';
  constructor() {
    super('Invalid license');
  }
}

/** Email is required for public license lookup. */
export class EmailRequiredError extends Error {
  readonly _tag = 'EmailRequiredError';
  constructor() {
    super('Email required');
  }
}

/** The request URL could not be parsed. */
export class InvalidRequestUrlError extends Error {
  readonly _tag = 'InvalidRequestUrlError';
  constructor() {
    super('Invalid request URL');
  }
}

/** Neither `key` nor `license_key` was provided. */
export class LicenseKeyRequiredError extends Error {
  readonly _tag = 'LicenseKeyRequiredError';
  constructor() {
    super('License key required');
  }
}

/** D1 was unavailable while validating a license. */
export class ValidateLicenseStoreUnavailable extends Error {
  readonly _tag = 'ValidateLicenseStoreUnavailable';
  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`License store unavailable during ${operation}`);
  }
}

/** JWT signing is not configured or failed. */
export class LicenseJwtError extends Error {
  readonly _tag = 'LicenseJwtError';
  constructor(override readonly cause?: unknown) {
    super('Internal server error');
  }
}

type ValidateLicenseError =
  | InvalidJsonBodyError
  | InvalidRequestUrlError
  | LicenseKeyRequiredError
  | ValidateLicenseParseError
  | ValidateLicenseStoreUnavailable
  | LicenseJwtError;

type InvalidLicensePayload = {
  readonly valid: false;
  readonly error: string;
};

type ValidLicensePayload = {
  readonly valid: true;
  readonly tier: string;
  readonly max_machines: number;
  readonly features: ReadonlyArray<string>;
  readonly customer: string;
  readonly expires_at: string | null;
  readonly token: string;
  readonly machines: ReadonlyArray<unknown>;
  readonly usage: ReadonlyArray<unknown>;
};

type ValidateLicensePayload = InvalidLicensePayload | ValidLicensePayload;

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

function queryFirst(
  db: D1Database,
  sql: string,
  params: ReadonlyArray<string | number>,
  operation: string
) {
  return Effect.tryPromise({
    try: () => {
      const statement = db.prepare(sql);
      return params.length === 0 ? statement.first() : statement.bind(...params).first();
    },
    catch: cause => new ValidateLicenseStoreUnavailable(operation, cause),
  });
}

function queryAll(
  db: D1Database,
  sql: string,
  params: ReadonlyArray<string | number>,
  operation: string
) {
  return Effect.tryPromise({
    try: () => {
      const statement = db.prepare(sql);
      return params.length === 0 ? statement.all() : statement.bind(...params).all();
    },
    catch: cause => new ValidateLicenseStoreUnavailable(operation, cause),
  });
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
    catch: cause => new ValidateLicenseStoreUnavailable(operation, cause),
  });
}

function decodeInput(
  request: Request
): Effect.Effect<
  ValidateLicenseRequest,
  InvalidJsonBodyError | InvalidRequestUrlError | LicenseKeyRequiredError
> {
  const fromFields = (fields: ValidateLicenseFields) => {
    const normalized = toValidateLicenseRequest(fields);
    return normalized === null
      ? Effect.fail(new LicenseKeyRequiredError())
      : Effect.succeed(normalized);
  };

  if (request.method === 'POST') {
    return decodeJsonBody(request, ValidateLicenseFieldsSchema).pipe(Effect.flatMap(fromFields));
  }

  return Effect.try({
    try: () => new URL(request.url),
    catch: () => new InvalidRequestUrlError(),
  }).pipe(
    Effect.flatMap(url =>
      decodeValidateLicenseFields({
        key: url.searchParams.get('key'),
        license_key: url.searchParams.get('license_key'),
        machine_id: url.searchParams.get('machine_id'),
        user_name: url.searchParams.get('user_name'),
        user_email: url.searchParams.get('user_email'),
      }).pipe(
        Effect.mapError(
          () => new InvalidJsonBodyError('Body does not match the expected contract')
        ),
        Effect.flatMap(fromFields)
      )
    )
  );
}

function resolveSigning(
  env: Env
): Effect.Effect<
  { readonly secret: string; readonly algorithm: 'HS256' | 'EdDSA' },
  LicenseJwtError
> {
  const privateKey = env.JWT_PRIVATE_KEY;
  if (privateKey !== undefined && privateKey.length > 0) {
    return Effect.succeed({ secret: privateKey, algorithm: 'EdDSA' as const });
  }
  const hsSecret = env.JWT_SECRET;
  if (hsSecret !== undefined && hsSecret.length > 0) {
    return Effect.succeed({ secret: hsSecret, algorithm: 'HS256' as const });
  }
  return Effect.fail(new LicenseJwtError());
}

function registerOrTouchMachine(
  env: Env,
  request: Request,
  license: ValidateLicenseRow,
  body: ValidateLicenseRequest
): Effect.Effect<
  InvalidLicensePayload | null,
  ValidateLicenseStoreUnavailable | ValidateLicenseParseError
> {
  const machineId = body.machineId;
  if (machineId === null) {
    return Effect.succeed(null);
  }
  return Effect.gen(function* () {
    const existingRow = yield* queryFirst(
      env.DB,
      `SELECT id FROM machines WHERE license_id = ? AND machine_id = ?`,
      [license.id, machineId],
      'findMachine'
    );
    if (existingRow !== null) {
      const existing = yield* decodeRow(
        ExistingMachineRowSchema,
        'Machine row has an invalid shape',
        existingRow
      );
      if (
        (body.userName !== null && body.userName.length > 0) ||
        (body.userEmail !== null && body.userEmail.length > 0)
      ) {
        yield* runSql(
          env.DB,
          `UPDATE machines SET last_seen_at = CURRENT_TIMESTAMP, user_name = COALESCE(?, user_name), user_email = COALESCE(?, user_email) WHERE id = ?`,
          [body.userName, body.userEmail, existing.id],
          'touchMachine'
        );
      } else {
        yield* runSql(
          env.DB,
          `UPDATE machines SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [existing.id],
          'touchMachine'
        );
      }
      return null;
    }

    const countRow = yield* queryFirst(
      env.DB,
      `SELECT COUNT(*) as count FROM machines WHERE license_id = ? AND is_active = 1`,
      [license.id],
      'countMachines'
    );
    const count =
      countRow === null
        ? 0
        : (yield* decodeRow(
            MachineCountRowSchema,
            'Machine count row has an invalid shape',
            countRow
          )).count;
    const maxMachines = maxMachinesFor(license);
    if (count >= maxMachines) {
      return {
        valid: false as const,
        error: `Machine limit reached (${maxMachines}). Revoke a machine in your dashboard or upgrade.`,
      };
    }

    yield* runSql(
      env.DB,
      `INSERT INTO machines (id, license_id, machine_id, user_name, user_email, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [generateId(), license.id, machineId, body.userName, body.userEmail],
      'insertMachine'
    );
    yield* Effect.promise(() =>
      logAudit(env.DB, license.customer_id, 'machine.registered', 'machine', machineId, request)
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
export function validateLicense(
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
      return { valid: false as const, error: 'Invalid license key' };
    }
    const license = yield* decodeRow(
      ValidateLicenseRowSchema,
      'License row has an invalid shape',
      licenseRow
    );
    if (license.status !== 'active') {
      return { valid: false as const, error: `License is ${license.status}` };
    }
    if (license.expires_at !== null && license.expires_at.length > 0) {
      const expiresAt = new Date(license.expires_at);
      if (expiresAt < new Date()) {
        return { valid: false as const, error: 'License has expired' };
      }
    }

    const machineLimit = yield* registerOrTouchMachine(env, request, license, body);
    if (machineLimit !== null) {
      return machineLimit;
    }

    const signing = yield* resolveSigning(env);
    const token = yield* Effect.tryPromise({
      try: () => generateLicenseJWT(license, body.machineId, signing.secret, signing.algorithm),
      catch: cause => new LicenseJwtError(cause),
    });

    const machineResult = yield* queryAll(
      env.DB,
      `SELECT machine_id, hostname, os, arch, omg_version, is_active, first_seen_at, last_seen_at, user_name, user_email
       FROM machines WHERE license_id = ?`,
      [license.id],
      'listMachines'
    );
    const machines = yield* decodeRowArray(
      ActiveMachineRowSchema,
      'Machine rows have an invalid shape',
      machineResult.results
    );
    const usageResult = yield* queryAll(
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
    const customerName = license.customer_name;
    return {
      valid: true as const,
      tier: license.tier,
      max_machines: maxMachinesFor(license),
      features: [...featuresForTier(license.tier)],
      customer: customerName === null || customerName.length === 0 ? license.email : customerName,
      expires_at: license.expires_at,
      token,
      machines,
      usage,
    };
  });
}

function httpStatusFor(error: ValidateLicenseError): number {
  switch (error._tag) {
    case 'InvalidJsonBodyError':
    case 'InvalidRequestUrlError':
    case 'LicenseKeyRequiredError':
      return 400;
    case 'ValidateLicenseParseError':
    case 'ValidateLicenseStoreUnavailable':
    case 'LicenseJwtError':
      return 500;
    default:
      return casesHandled(error);
  }
}

/**
 * HTTP adapter for `GET|POST /api/validate-license`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON validation payload or a mapped error response.
 */
export async function handleValidateLicense(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(validateLicense(request, env));
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        return errorResponse(error.message, httpStatusFor(error));
      }
      return errorResponse('Internal server error', 500);
    },
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

type GetLicensePayload =
  | { readonly found: false }
  | {
      readonly found: true;
      readonly license_key: string;
      readonly tier: string;
      readonly status: string;
      readonly expires_at: string | null;
      readonly max_machines: number | null;
      readonly used_machines: number;
    };

function lookupPublicLicense(
  request: Request,
  env: Env
): Effect.Effect<
  GetLicensePayload,
  | InvalidRequestUrlError
  | EmailRequiredError
  | ValidateLicenseStoreUnavailable
  | LicenseOpsParseError
> {
  return Effect.gen(function* () {
    const url = yield* Effect.try({
      try: () => new URL(request.url),
      catch: () => new InvalidRequestUrlError(),
    });
    const rawEmail = url.searchParams.get('email');
    if (rawEmail === null || rawEmail.length === 0) {
      return yield* Effect.fail(new EmailRequiredError());
    }
    const email = yield* Schema.decodeUnknown(EmailAddress)(rawEmail).pipe(
      Effect.mapError(() => new EmailRequiredError())
    );
    const licenseRow = yield* queryFirst(
      env.DB,
      `SELECT l.license_key, l.tier, l.status, l.expires_at, l.max_seats as max_machines
       FROM licenses l
       JOIN customers c ON l.customer_id = c.id
       WHERE c.email = ?`,
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
    const countRow = yield* queryFirst(
      env.DB,
      `SELECT COUNT(*) as count FROM machines m
       JOIN licenses l ON m.license_id = l.id
       JOIN customers c ON l.customer_id = c.id
       WHERE c.email = ? AND m.is_active = 1`,
      [email],
      'publicMachineCount'
    );
    const used =
      countRow === null
        ? 0
        : (yield* decodeLicenseOpsRow(
            CountRowSchema,
            'Machine count row has an invalid shape',
            countRow
          )).count;
    return {
      found: true as const,
      license_key: maskKey(license.license_key),
      tier: license.tier,
      status: license.status,
      expires_at: license.expires_at,
      max_machines: license.max_machines,
      used_machines: used,
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
  const exit = await Effect.runPromiseExit(lookupPublicLicense(request, env));
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        const status =
          error._tag === 'InvalidRequestUrlError' || error._tag === 'EmailRequiredError'
            ? 400
            : 500;
        return errorResponse(error.message, status);
      }
      return errorResponse('Internal server error', 500);
    },
  });
}

type ReportUsageError =
  | InvalidJsonBodyError
  | InvalidLicenseError
  | LicenseOpsParseError
  | ValidateLicenseStoreUnavailable;

function reportUsage(
  request: Request,
  env: Env
): Effect.Effect<{ readonly success: true }, ReportUsageError> {
  return Effect.gen(function* () {
    const body = yield* decodeJsonBody(request, ReportUsageRequestSchema);
    const policy = yield* resolveTelemetryIngestion(env.DB, body.license_key).pipe(
      Effect.mapError(cause => new ValidateLicenseStoreUnavailable('reportTelemetryPolicy', cause))
    );
    if (policy._tag === 'invalidLicense') {
      return yield* Effect.fail(new InvalidLicenseError());
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
        generateId(),
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
): Effect.Effect<void, ValidateLicenseStoreUnavailable> {
  return Effect.gen(function* () {
    const machineId = body.machine_id;
    if (machineId !== undefined && machineId.length > 0) {
      yield* runSql(
        env.DB,
        `INSERT INTO usage_member_daily (id, license_id, machine_id, date, commands_run, packages_installed, runtimes_switched, time_saved_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(license_id, machine_id, date) DO UPDATE SET
           commands_run = MAX(usage_member_daily.commands_run, excluded.commands_run),
           packages_installed = MAX(usage_member_daily.packages_installed, excluded.packages_installed),
           runtimes_switched = MAX(usage_member_daily.runtimes_switched, excluded.runtimes_switched),
           time_saved_ms = MAX(usage_member_daily.time_saved_ms, excluded.time_saved_ms)`,
        [
          generateId(),
          licenseId,
          machineId,
          today,
          optionalNumber(body.commands_run),
          optionalNumber(body.packages_installed),
          optionalNumber(body.runtimes_switched),
          optionalNumber(body.time_saved_ms),
        ],
        'upsertMemberUsage'
      );
      yield* runSql(
        env.DB,
        `UPDATE machines SET
           last_seen_at = CURRENT_TIMESTAMP,
           hostname = COALESCE(?, hostname),
           os = COALESCE(?, os),
           arch = COALESCE(?, arch),
           omg_version = COALESCE(?, omg_version)
         WHERE license_id = ? AND machine_id = ?`,
        [
          optionalText(body.hostname),
          optionalText(body.os),
          optionalText(body.arch),
          optionalText(body.omg_version),
          licenseId,
          machineId,
        ],
        'touchReportedMachine'
      );
    }

    const packages = body.installed_packages;
    if (packages !== undefined) {
      for (const [pkg, count] of Object.entries(packages)) {
        yield* runSql(
          env.DB,
          `INSERT INTO analytics_packages (package_name, install_count, last_seen_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(package_name) DO UPDATE SET install_count = install_count + ?, last_seen_at = CURRENT_TIMESTAMP`,
          [pkg, count, count],
          'upsertPackageStat'
        );
      }
    }

    const runtimes = body.runtime_usage_counts;
    if (runtimes !== undefined) {
      for (const [runtime, count] of Object.entries(runtimes)) {
        yield* runSql(
          env.DB,
          `INSERT INTO analytics_daily (date, metric, dimension, value)
           VALUES (?, 'version', ?, ?)
           ON CONFLICT(date, metric, dimension) DO UPDATE SET value = value + ?`,
          [today, runtime, count, count],
          'upsertRuntimeStat'
        );
      }
    }

    const achievements = body.achievements;
    if (achievements !== undefined) {
      for (const achievement of achievements) {
        yield* runSql(
          env.DB,
          `INSERT OR IGNORE INTO achievements (id, customer_id, achievement_id)
           VALUES (?, ?, ?)`,
          [generateId(), customerId, achievement],
          'upsertAchievement'
        );
      }
    }
  });
}

/**
 * HTTP adapter for `POST /api/report-usage`.
 *
 * @param request - Incoming POST with JSON body.
 * @param env - Worker bindings.
 * @returns JSON success payload or a mapped error response.
 */
export async function handleReportUsage(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(reportUsage(request, env));
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        if (error._tag === 'InvalidJsonBodyError') {
          return errorResponse(error.message, 400);
        }
        if (error._tag === 'InvalidLicenseError') {
          return errorResponse(error.message, 401);
        }
        return errorResponse('Internal server error', 500);
      }
      return errorResponse('Internal server error', 500);
    },
  });
}

// Handle install ping (anonymous telemetry)

class InstallPingStoreUnavailable extends Error {
  readonly _tag = 'InstallPingStoreUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Internal server error');
  }
}

/** The install ping payload sent by the CLI on first run. */
const InstallPingBodySchema = Schema.Struct({
  install_id: Schema.String.pipe(Schema.minLength(1)),
  timestamp: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  platform: Schema.optional(Schema.String),
  backend: Schema.optional(Schema.String),
});

/**
 * HTTP adapter for anonymous install telemetry.
 *
 * @param request - Incoming POST with JSON body.
 * @param env - Worker bindings.
 * @returns JSON success payload or a mapped error response.
 */
export async function handleInstallPing(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const body = yield* decodeJsonBody(request, InstallPingBodySchema);
      const version = body.version === undefined ? 'unknown' : body.version;
      const platform = body.platform === undefined ? 'unknown' : body.platform;
      const backend = body.backend === undefined ? 'unknown' : body.backend;
      yield* Effect.tryPromise({
        try: () =>
          env.DB.prepare(
            `INSERT OR IGNORE INTO install_stats (id, install_id, version, platform, backend, created_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
          )
            .bind(generateId(), body.install_id, version, platform, backend)
            .run(),
        catch: cause => new InstallPingStoreUnavailable(cause),
      });
      return { success: true as const, message: 'Install recorded' };
    })
  );
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure) && failure.value._tag === 'InvalidJsonBodyError') {
        return errorResponse('Invalid JSON body', 400);
      }
      return errorResponse('Internal server error', 500);
    },
  });
}

// Generate JWT for offline license validation
async function generateLicenseJWT(
  license: ValidateLicenseRow,
  machineId: string | null,
  secret: string,
  algorithm: 'HS256' | 'EdDSA' = 'HS256'
): Promise<string> {
  const header = { alg: algorithm, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: license.customer_id,
    tier: license.tier,
    features: [...featuresForTier(license.tier)],
    exp: now + 7 * 24 * 60 * 60, // 7 days
    iat: now,
    mid: machineId,
    lic: license.license_key,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const signature =
    algorithm === 'EdDSA' ? await eddsaSign(secret, data) : await hmacSign(secret, data);

  return `${data}.${signature}`;
}

function base64UrlEncode(data: Uint8Array | string): string {
  if (data instanceof Uint8Array) {
    return btoa(String.fromCharCode(...data))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(data: string): string {
  const padded = data + '==='.slice(0, (4 - (data.length % 4)) % 4);
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
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

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    false,
    ['sign']
  );

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
  InvalidJsonBodyError | ValidateLicenseStoreUnavailable
> {
  return Effect.gen(function* () {
    const body = yield* decodeJsonBody(request, AnalyticsBatchSchema);
    const requestedEvents = body.events === undefined ? [] : body.events;
    if (requestedEvents.length === 0) {
      return { success: true as const, processed: 0 };
    }

    const decisionsByLicenseKey = new Map<string, TelemetryIngestionDecision>();
    const events: AnalyticsEvent[] = [];
    for (const event of requestedEvents) {
      if (event.license_key === undefined) {
        events.push(event);
        continue;
      }

      let decision = decisionsByLicenseKey.get(event.license_key);
      if (decision === undefined) {
        decision = yield* resolveTelemetryIngestion(env.DB, event.license_key).pipe(
          Effect.mapError(
            cause => new ValidateLicenseStoreUnavailable('analyticsTelemetryPolicy', cause)
          )
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
        statements.push(
          env.DB.prepare(
            `INSERT INTO analytics_daily (date, metric, dimension, value)
             VALUES (?, 'commands', ?, 1)
             ON CONFLICT(date, metric, dimension) DO UPDATE SET value = value + 1`
          ).bind(today, event.event_name)
        );
        statements.push(
          env.DB.prepare(
            `INSERT INTO analytics_daily (date, metric, dimension, value)
             VALUES (?, 'total_commands', 'all', 1)
             ON CONFLICT(date, metric, dimension) DO UPDATE SET value = value + 1`
          ).bind(today)
        );
        statements.push(
          env.DB.prepare(
            `INSERT INTO analytics_daily (date, metric, dimension, value)
             VALUES (?, 'platform', ?, 1)
             ON CONFLICT(date, metric, dimension) DO UPDATE SET value = value + 1`
          ).bind(today, event.platform)
        );
        statements.push(
          env.DB.prepare(
            `INSERT INTO analytics_daily (date, metric, dimension, value)
             VALUES (?, 'version', ?, 1)
             ON CONFLICT(date, metric, dimension) DO UPDATE SET value = value + 1`
          ).bind(today, event.version)
        );
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
        statements.push(
          env.DB.prepare(
            `INSERT INTO analytics_daily (date, metric, dimension, value)
             VALUES (?, 'errors', ?, 1)
             ON CONFLICT(date, metric, dimension) DO UPDATE SET value = value + 1`
          ).bind(today, errorType)
        );
      }
    }
    yield* Effect.tryPromise({
      try: () => env.DB.batch(statements),
      catch: cause => new ValidateLicenseStoreUnavailable('analyticsBatch', cause),
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
  const exit = await Effect.runPromiseExit(ingestAnalytics(request, env));
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure) && failure.value._tag === 'InvalidJsonBodyError') {
        return errorResponse('Invalid JSON body', 400);
      }
      return errorResponse('Failed to process analytics', 500);
    },
  });
}
