import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  AdminOverviewForbidden,
  LicensingSummaryBodyTooLarge,
  LicensingSummaryInvalidPayload,
  loadAdminServiceSession,
  loadInternalWorkerPayload,
  loadPrivateWorkerPayload,
  requestPrivateWorkerResponse,
  type LicensingServiceOperation,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
} from './licensing-service.server';

const RESPONSE_LIMIT = 512 * 1024;
const EXPORT_LIMIT = 2 * 1024 * 1024;
const Count = Schema.Number.check(Schema.makeFilter(value => Number.isFinite(value) && value >= 0));
const Text = Schema.String.check(Schema.isMaxLength(256));
const NonEmptyText = Text.check(Schema.isMinLength(1));
const OptionalText = Schema.NullOr(Text);
const AUDIT_ACTION_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,4}$/u;
const FIREHOSE_SINCE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u;
const PAGE_SIZE = 25;

const AuditSchema = Schema.Struct({
  logs: Schema.Array(
    Schema.Struct({
      user_email: OptionalText,
      action: NonEmptyText,
      ip_address: OptionalText,
      created_at: NonEmptyText,
    })
  ),
  pagination: Schema.Struct({ page: Count, limit: Count, total: Count, pages: Count }),
});

const FirehoseSchema = Schema.Struct({
  events: Schema.Array(
    Schema.Struct({
      event_type: NonEmptyText,
      event_name: NonEmptyText,
      timestamp: NonEmptyText,
      version: NonEmptyText,
      platform: NonEmptyText,
      duration_ms: Schema.NullOr(Count),
      created_at: NonEmptyText,
    })
  ),
  count: Count,
  timestamp: NonEmptyText,
});

interface AdminAuditQuery {
  readonly action: string | null;
  readonly page: number;
}

export function parseAdminAuditQuery(url: URL): AdminAuditQuery | null {
  const rawPage = url.searchParams.get('page') ?? '1';
  const page = Number(rawPage);
  if (!Number.isInteger(page) || page < 1 || page > 10_000 || String(page) !== rawPage) return null;
  const rawAction = url.searchParams.get('action');
  const action = rawAction === null || rawAction === '' ? null : rawAction;
  if (action !== null && (action.length > 128 || !AUDIT_ACTION_PATTERN.test(action))) return null;
  return { action, page };
}

export function parseFirehoseSince(value: string | null): string | null | undefined {
  if (value === null || value === '') return null;
  return FIREHOSE_SINCE_PATTERN.test(value) ? value : undefined;
}

type AdminAudit = ReturnType<typeof projectAudit>;
type AdminFirehose = ReturnType<typeof projectFirehose>;

function projectAudit(payload: Schema.Schema.Type<typeof AuditSchema>) {
  return {
    logs: payload.logs.map(log => ({
      email: log.user_email,
      action: log.action,
      ipAddress: log.ip_address,
      createdAt: log.created_at,
    })),
    pagination: payload.pagination,
  };
}

function projectFirehose(payload: Schema.Schema.Type<typeof FirehoseSchema>) {
  return {
    events: payload.events.map(event => ({
      eventType: event.event_type,
      eventName: event.event_name,
      timestamp: event.timestamp,
      version: event.version,
      platform: event.platform,
      durationMs: event.duration_ms,
      createdAt: event.created_at,
    })),
    count: payload.count,
    refreshedAt: payload.timestamp,
  };
}

type AdminOperationsError = LicensingSummaryError | AdminOverviewForbidden;

/** Load an exact, bounded audit page with an optional server-side action filter. */
export function loadAdminAudit(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  query: AdminAuditQuery
): Effect.Effect<AdminAudit, AdminOperationsError> {
  return Effect.gen(function* () {
    const session = yield* loadAdminServiceSession(identity, env);
    const parameters = new URLSearchParams({ page: String(query.page), limit: String(PAGE_SIZE) });
    if (query.action !== null) parameters.set('action', query.action);
    const payload = yield* loadPrivateWorkerPayload(
      env,
      session,
      `/api/admin/audit-log?${parameters.toString()}`,
      'admin-audit',
      RESPONSE_LIMIT,
      AuditSchema
    );
    return projectAudit(payload);
  });
}

/** Load one privacy-reduced firehose page; raw event, session, and machine IDs are discarded. */
export function loadAdminFirehose(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  since: string | null
): Effect.Effect<AdminFirehose, AdminOperationsError> {
  return Effect.gen(function* () {
    const session = yield* loadAdminServiceSession(identity, env);
    const parameters = new URLSearchParams({ limit: '50' });
    if (since !== null) parameters.set('since', since);
    const payload = yield* loadPrivateWorkerPayload(
      env,
      session,
      `/api/admin/firehose?${parameters.toString()}`,
      'admin-firehose',
      RESPONSE_LIMIT,
      FirehoseSchema
    );
    return projectFirehose(payload);
  });
}

/** Poll the private firehose after Svelte has independently re-authorized the operator. */
export function loadInternalAdminFirehose(
  env: LicensingSummaryEnvironment,
  since: string | null
): Effect.Effect<AdminFirehose, LicensingSummaryError> {
  const parameters = new URLSearchParams({ limit: '50' });
  if (since !== null) parameters.set('since', since);
  return loadInternalWorkerPayload(
    env,
    `/api/internal/admin/firehose?${parameters.toString()}`,
    'admin-firehose',
    RESPONSE_LIMIT,
    FirehoseSchema
  ).pipe(Effect.map(projectFirehose));
}

export const ADMIN_EXPORTS = {
  users: {
    path: '/api/admin/export/users',
    operation: 'admin-export-users',
    filename: 'omg-users.csv',
  },
  usage: {
    path: '/api/admin/export/usage',
    operation: 'admin-export-usage',
    filename: 'omg-usage.csv',
  },
  audit: {
    path: '/api/admin/export/audit',
    operation: 'admin-export-audit',
    filename: 'omg-audit.csv',
  },
} as const satisfies Record<
  string,
  {
    readonly path: `/${string}`;
    readonly operation: LicensingServiceOperation;
    readonly filename: string;
  }
>;

type AdminExportKind = keyof typeof ADMIN_EXPORTS;

export function isAdminExportKind(value: string): value is AdminExportKind {
  return value === 'users' || value === 'usage' || value === 'audit';
}

async function readBoundedExport(
  response: Response,
  operation: LicensingServiceOperation
): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > EXPORT_LIMIT) {
    await response.body?.cancel().catch(() => undefined);
    throw new LicensingSummaryBodyTooLarge(operation);
  }
  if (response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/csv') {
    await response.body?.cancel().catch(() => undefined);
    throw new LicensingSummaryInvalidPayload(operation);
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new LicensingSummaryInvalidPayload(operation);
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > EXPORT_LIMIT) {
      await reader.cancel().catch(() => undefined);
      throw new LicensingSummaryBodyTooLarge(operation);
    }
    chunks.push(next.value);
  }
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause: unknown) {
    throw new LicensingSummaryInvalidPayload(operation, cause);
  }
  return buffer;
}

/** Load one audited private Worker CSV export through a fixed byte ceiling. */
export function loadAdminExport(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  kind: AdminExportKind
): Effect.Effect<ArrayBuffer, AdminOperationsError> {
  return Effect.gen(function* () {
    const session = yield* loadAdminServiceSession(identity, env);
    const target = ADMIN_EXPORTS[kind];
    const response = yield* requestPrivateWorkerResponse(
      env,
      session,
      target.path,
      target.operation
    );
    return yield* Effect.tryPromise({
      try: () => readBoundedExport(response, target.operation),
      catch: cause =>
        cause instanceof LicensingSummaryBodyTooLarge ||
        cause instanceof LicensingSummaryInvalidPayload
          ? cause
          : new LicensingSummaryInvalidPayload(target.operation, cause),
    });
  });
}
