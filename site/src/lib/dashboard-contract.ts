import { Schema } from '@effect/schema';
import type { CLITelemetryReport } from '../types/telemetry';
import {
  decodeDashboardData,
  type DashboardData as ContractDashboardData,
} from './contracts/dashboard';
import { decodeTelemetryDashboard, type TelemetryDashboard } from './contracts/telemetry-dashboard';

// Boundary parser internals intentionally inspect unknown JSON values and dynamic object fields.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get -- Safe JSON boundary parsing requires these operations.

/** Data returned by the authenticated account dashboard endpoint. */
export type DashboardData = ContractDashboardData;

/** The telemetry dashboard payload consumed by the account dashboard. */
export type TelemetryData = TelemetryDashboard;

/** A license lookup response used by the public landing page. */
export type LicenseLookup =
  | { readonly found: false }
  | { readonly found: true; readonly license_key: string; readonly tier: string };

/** A single weekly GitHub activity point. */
export interface GitHubActivityWeek {
  readonly week: number;
  readonly total: number;
}

const GitHubActivityBarSchema = Schema.Struct({
  label: Schema.String,
  value: Schema.Number.pipe(Schema.finite()),
});

const GitHubActivityCacheSchema = Schema.Struct({
  data: Schema.Array(GitHubActivityBarSchema),
  total: Schema.Number.pipe(Schema.finite()),
  timestamp: Schema.Number.pipe(Schema.finite()),
});

/** A parsed localStorage cache of rendered GitHub activity bars. */
export type GitHubActivityCache = Schema.Schema.Type<typeof GitHubActivityCacheSchema>;

/** The two response shapes returned while GitHub computes statistics. */
export interface GitHubComputingResponse {
  readonly computing: boolean;
  readonly message: string | undefined;
}

/** The two response shapes returned while GitHub computes statistics. */
export type GitHubActivityResponse = readonly GitHubActivityWeek[] | GitHubComputingResponse;

/** A session token returned by the API Worker bridge. */
export interface WorkerSessionResponse {
  readonly token: string;
  readonly expiresAt: string;
}

/** A license validation request sent by the CLI. */
export interface LicenseValidationRequest {
  readonly license_key: string;
}

/** Inputs accepted by the admin CRM note endpoints. */
export interface AdminCrmNoteInput {
  readonly customerId?: string;
  readonly noteId?: string;
  readonly content?: string;
  readonly noteType?: string;
  readonly isPinned?: boolean;
}

/** Inputs accepted by the admin CRM tag endpoints. */
export interface AdminCrmTagInput {
  readonly customerId?: string;
  readonly tagId?: string;
  readonly name?: string;
  readonly color?: string;
  readonly description?: string;
}

export interface ExternalLicenseMachine {
  readonly machine_id: string;
  readonly hostname?: string;
  readonly os?: string;
  readonly arch?: string;
  readonly omg_version?: string;
  readonly is_active: number;
  readonly first_seen_at?: string;
  readonly last_seen_at?: string;
}

export interface ExternalLicenseUsage {
  readonly date: string;
  readonly commands_run: number;
  readonly packages_installed: number;
  readonly packages_searched: number;
  readonly runtimes_switched: number;
  readonly sbom_generated: number;
  readonly vulnerabilities_found: number;
  readonly time_saved_ms: number;
}

export interface ExternalLicenseResponse {
  readonly valid: boolean;
  readonly tier?: string;
  readonly max_machines?: number;
  readonly machines?: readonly ExternalLicenseMachine[];
  readonly usage?: readonly ExternalLicenseUsage[];
}

/** A successful or rejected parse at an HTTP boundary. */
export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(value: object, name: string): unknown {
  return Reflect.get(value, name);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/**
 * Parse the account dashboard response at the network boundary.
 *
 * @param value - Untrusted JSON returned by the account endpoint.
 * @returns A typed payload or a safe parse failure.
 */
export function parseDashboardData(value: unknown): ParseResult<DashboardData> {
  const decoded = decodeDashboardData(value);
  return decoded
    ? { ok: true, value: decoded }
    : { ok: false, error: 'Dashboard response has an invalid shape' };
}

/**
 * Parse the telemetry dashboard response at the network boundary.
 *
 * @param value - Untrusted JSON returned by the telemetry endpoint.
 * @returns A typed payload or a safe parse failure.
 */
export function parseTelemetryData(value: unknown): ParseResult<TelemetryData> {
  const decoded = decodeTelemetryDashboard(value);
  return decoded
    ? { ok: true, value: decoded }
    : { ok: false, error: 'Telemetry response has an invalid shape' };
}

/**
 * Parse the token returned by the Better Auth bridge.
 *
 * @param value - Untrusted JSON returned by the bridge endpoint.
 * @returns A token or a safe parse failure.
 */
export function parseSessionToken(value: unknown): ParseResult<string> {
  const token = isObject(value) ? field(value, 'token') : undefined;
  return isString(token)
    ? { ok: true, value: token }
    : { ok: false, error: 'Authentication bridge returned an invalid token' };
}

/**
 * Extract a safe human-readable API error without trusting the response shape.
 *
 * @param value - Untrusted JSON returned by an API.
 * @param fallback - Message used when the response has no usable error.
 * @returns A safe error message.
 */
export function parseApiError(value: unknown, fallback: string): string {
  if (!isObject(value)) {
    return fallback;
  }

  const error = field(value, 'error');
  if (isString(error) && error.length > 0) {
    return error;
  }

  const message = field(value, 'message');
  return isString(message) && message.length > 0 ? message : fallback;
}

/**
 * Parse a public license lookup response.
 *
 * @param value - Untrusted JSON returned by the licensing endpoint.
 * @returns A typed lookup response or a safe parse failure.
 */
export function parseLicenseLookup(value: unknown): ParseResult<LicenseLookup> {
  if (!isObject(value) || !isBoolean(field(value, 'found'))) {
    return { ok: false, error: 'License lookup response has an invalid shape' };
  }

  if (field(value, 'found') === false) {
    return { ok: true, value: { found: false } };
  }

  const licenseKey = field(value, 'license_key');
  const tier = field(value, 'tier');
  return isString(licenseKey) && isString(tier)
    ? { ok: true, value: { found: true, license_key: licenseKey, tier } }
    : { ok: false, error: 'License lookup response has an invalid license' };
}

/**
 * Parse GitHub commit activity or its temporary computing response.
 *
 * @param value - Untrusted JSON returned by the GitHub proxy.
 * @returns A typed response or a safe parse failure.
 */
export function parseGitHubActivity(value: unknown): ParseResult<GitHubActivityResponse> {
  if (
    isArrayOf(
      value,
      (item): item is GitHubActivityWeek =>
        isObject(item) &&
        isFiniteNumber(field(item, 'week')) &&
        isFiniteNumber(field(item, 'total'))
    )
  ) {
    return { ok: true, value };
  }

  if (!isObject(value) || !isBoolean(field(value, 'computing'))) {
    return { ok: false, error: 'GitHub activity response has an invalid shape' };
  }

  const computing = field(value, 'computing');
  const message = field(value, 'message');
  if (!isBoolean(computing)) {
    return { ok: false, error: 'GitHub activity response has an invalid computing flag' };
  }
  if (message !== undefined && !isString(message)) {
    return { ok: false, error: 'GitHub activity response has an invalid message' };
  }

  const response = {
    computing,
    message: isString(message) ? message : undefined,
  };
  return { ok: true, value: response };
}

/**
 * Parse a locally cached GitHub activity payload.
 *
 * @param value - Untrusted JSON from localStorage.
 * @returns A typed cache entry or a safe parse failure.
 */
export function parseGitHubActivityCache(value: unknown): ParseResult<GitHubActivityCache> {
  const decoded = Schema.decodeUnknownEither(GitHubActivityCacheSchema)(value);
  if (decoded._tag === 'Left') {
    return { ok: false, error: 'GitHub activity cache has an invalid shape' };
  }
  return { ok: true, value: decoded.right };
}

/**
 * Parse the API Worker session bridge response.
 *
 * @param value - Untrusted JSON returned by the Worker bridge.
 * @returns A typed session response or a safe parse failure.
 */
export function parseWorkerSessionResponse(value: unknown): ParseResult<WorkerSessionResponse> {
  if (!isObject(value)) {
    return { ok: false, error: 'Worker session response has an invalid shape' };
  }

  const token = field(value, 'token');
  const expiresAt = field(value, 'expiresAt');
  return isString(token) && isString(expiresAt)
    ? { ok: true, value: { token, expiresAt } }
    : { ok: false, error: 'Worker session response has an invalid shape' };
}

/**
 * Parse the CLI license validation request.
 *
 * @param value - Untrusted JSON submitted by the CLI.
 * @returns A typed request or a safe parse failure.
 */
export function parseLicenseValidationRequest(
  value: unknown
): ParseResult<LicenseValidationRequest> {
  if (!isObject(value)) {
    return { ok: false, error: 'License request has an invalid shape' };
  }

  const licenseKey = field(value, 'license_key');
  return isString(licenseKey) && licenseKey.length > 0
    ? { ok: true, value: { license_key: licenseKey } }
    : { ok: false, error: 'License key is required' };
}

function optionalString(value: object, name: string): string | undefined {
  const candidate = field(value, name);
  if (candidate === undefined) {
    return undefined;
  }
  return isString(candidate) ? candidate : undefined;
}

function requiredNumber(value: object, name: string): number | undefined {
  const candidate = field(value, name);
  return isFiniteNumber(candidate) ? candidate : undefined;
}

function optionalNumber(value: object, name: string): number | undefined {
  const candidate = field(value, name);
  if (candidate === undefined) {
    return undefined;
  }
  return isFiniteNumber(candidate) ? candidate : undefined;
}

/** Parse an admin CRM note request body. */
export function parseAdminCrmNoteInput(value: unknown): ParseResult<AdminCrmNoteInput> {
  if (!isObject(value)) {
    return { ok: false, error: 'Note request has an invalid shape' };
  }

  const isPinned = field(value, 'isPinned');
  if (isPinned !== undefined && !isBoolean(isPinned)) {
    return { ok: false, error: 'Note request has an invalid pinned flag' };
  }

  return {
    ok: true,
    value: {
      customerId: optionalString(value, 'customerId'),
      noteId: optionalString(value, 'noteId'),
      content: optionalString(value, 'content'),
      noteType: optionalString(value, 'noteType'),
      isPinned: isBoolean(isPinned) ? isPinned : undefined,
    },
  };
}

/** Parse an admin CRM tag request body. */
export function parseAdminCrmTagInput(value: unknown): ParseResult<AdminCrmTagInput> {
  if (!isObject(value)) {
    return { ok: false, error: 'Tag request has an invalid shape' };
  }

  return {
    ok: true,
    value: {
      customerId: optionalString(value, 'customerId'),
      tagId: optionalString(value, 'tagId'),
      name: optionalString(value, 'name'),
      color: optionalString(value, 'color'),
      description: optionalString(value, 'description'),
    },
  };
}

function parseExternalMachine(value: unknown): ExternalLicenseMachine | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const machineId = field(value, 'machine_id');
  const active = field(value, 'is_active');
  if (!isString(machineId) || !isFiniteNumber(active)) {
    return undefined;
  }
  return {
    machine_id: machineId,
    hostname: optionalString(value, 'hostname'),
    os: optionalString(value, 'os'),
    arch: optionalString(value, 'arch'),
    omg_version: optionalString(value, 'omg_version'),
    is_active: active,
    first_seen_at: optionalString(value, 'first_seen_at'),
    last_seen_at: optionalString(value, 'last_seen_at'),
  };
}

function parseExternalUsage(value: unknown): ExternalLicenseUsage | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const date = field(value, 'date');
  const commandsRun = requiredNumber(value, 'commands_run');
  const packagesInstalled = requiredNumber(value, 'packages_installed');
  const packagesSearched = requiredNumber(value, 'packages_searched');
  const runtimesSwitched = requiredNumber(value, 'runtimes_switched');
  const sbomGenerated = requiredNumber(value, 'sbom_generated');
  const vulnerabilitiesFound = requiredNumber(value, 'vulnerabilities_found');
  const timeSavedMs = requiredNumber(value, 'time_saved_ms');
  if (
    !isString(date) ||
    commandsRun === undefined ||
    packagesInstalled === undefined ||
    packagesSearched === undefined ||
    runtimesSwitched === undefined ||
    sbomGenerated === undefined ||
    vulnerabilitiesFound === undefined ||
    timeSavedMs === undefined
  ) {
    return undefined;
  }
  return {
    date,
    commands_run: commandsRun,
    packages_installed: packagesInstalled,
    packages_searched: packagesSearched,
    runtimes_switched: runtimesSwitched,
    sbom_generated: sbomGenerated,
    vulnerabilities_found: vulnerabilitiesFound,
    time_saved_ms: timeSavedMs,
  };
}

/** Parse a CLI telemetry report before persistence. */
export function parseCLITelemetryReport(value: unknown): ParseResult<CLITelemetryReport> {
  if (!isObject(value)) {
    return { ok: false, error: 'Telemetry report has an invalid shape' };
  }

  const licenseKey = field(value, 'license_key');
  const machineId = field(value, 'machine_id');
  if (
    !isString(licenseKey) ||
    licenseKey.length === 0 ||
    !isString(machineId) ||
    machineId.length === 0
  ) {
    return { ok: false, error: 'Telemetry report requires license_key and machine_id' };
  }

  const optionalFields = [
    'commands_run',
    'packages_installed',
    'packages_searched',
    'runtimes_switched',
    'sbom_generated',
    'vulnerabilities_found',
    'time_saved_ms',
  ];
  if (
    optionalFields.some(
      name => field(value, name) !== undefined && optionalNumber(value, name) === undefined
    )
  ) {
    return { ok: false, error: 'Telemetry report has invalid numeric data' };
  }

  return {
    ok: true,
    value: {
      license_key: licenseKey,
      machine_id: machineId,
      hostname: optionalString(value, 'hostname'),
      os: optionalString(value, 'os'),
      arch: optionalString(value, 'arch'),
      omg_version: optionalString(value, 'omg_version'),
      commands_run: optionalNumber(value, 'commands_run'),
      packages_installed: optionalNumber(value, 'packages_installed'),
      packages_searched: optionalNumber(value, 'packages_searched'),
      runtimes_switched: optionalNumber(value, 'runtimes_switched'),
      sbom_generated: optionalNumber(value, 'sbom_generated'),
      vulnerabilities_found: optionalNumber(value, 'vulnerabilities_found'),
      time_saved_ms: optionalNumber(value, 'time_saved_ms'),
    },
  };
}

/** Parse the response returned by the external license API. */
export function parseExternalLicenseResponse(value: unknown): ParseResult<ExternalLicenseResponse> {
  if (!isObject(value)) {
    return { ok: false, error: 'External license response has an invalid shape' };
  }
  const valid = field(value, 'valid');
  if (!isBoolean(valid)) {
    return { ok: false, error: 'External license response has an invalid shape' };
  }

  const tier = optionalString(value, 'tier');
  const maxMachines = field(value, 'max_machines');
  const machines = field(value, 'machines');
  const usage = field(value, 'usage');
  if (maxMachines !== undefined && !isFiniteNumber(maxMachines)) {
    return { ok: false, error: 'External license response has an invalid machine limit' };
  }
  if (
    machines !== undefined &&
    (!Array.isArray(machines) || machines.some(item => !parseExternalMachine(item)))
  ) {
    return { ok: false, error: 'External license response has invalid machine data' };
  }
  if (
    usage !== undefined &&
    (!Array.isArray(usage) || usage.some(item => !parseExternalUsage(item)))
  ) {
    return { ok: false, error: 'External license response has invalid usage data' };
  }

  return {
    ok: true,
    value: {
      valid,
      tier,
      max_machines: isFiniteNumber(maxMachines) ? maxMachines : undefined,
      machines: Array.isArray(machines)
        ? machines.flatMap(item => {
            const parsed = parseExternalMachine(item);
            return parsed ? [parsed] : [];
          })
        : undefined,
      usage: Array.isArray(usage)
        ? usage.flatMap(item => {
            const parsed = parseExternalUsage(item);
            return parsed ? [parsed] : [];
          })
        : undefined,
    },
  };
}
