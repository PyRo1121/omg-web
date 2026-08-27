import { error } from '@sveltejs/kit';
import { Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type { DashboardData } from '../../../../site/shared/account-dashboard';
import { createShadowAuth, type AuthEnvironment } from './auth.server';
import { normalizedOptionalText } from './optional-text.server';

const SESSION_QUERY =
  'SELECT id, token, ip_address AS ipAddress, user_agent AS userAgent, created_at AS createdAt, expires_at AS expiresAt FROM auth_session WHERE user_id = ?';
const ACCOUNT_QUERY =
  'SELECT provider_id AS providerId, account_id AS accountId FROM auth_account WHERE user_id = ?';

const SessionRowSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMaxLength(256)),
  token: Schema.String.check(Schema.isMaxLength(256)),
  ipAddress: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
  userAgent: Schema.NullOr(Schema.String.check(Schema.isMaxLength(512))),
  createdAt: Schema.Union([Schema.Number, Schema.String]),
  expiresAt: Schema.Union([Schema.Number, Schema.String]),
});
const AccountRowSchema = Schema.Struct({
  providerId: Schema.String,
  accountId: Schema.String,
});
type DashboardBoundaryInput = Schema.Top['Encoded'];

const DashboardDataSchema = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    emailVerified: Schema.Boolean,
    image: Schema.NullOr(Schema.String),
    createdAt: Schema.String,
  }),
  sessions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      ipAddress: Schema.NullOr(Schema.String),
      userAgent: Schema.NullOr(Schema.String),
      createdAt: Schema.String,
      expiresAt: Schema.String,
      isCurrent: Schema.Boolean,
    })
  ),
  accounts: Schema.Array(Schema.Struct({ provider: Schema.String, accountId: Schema.String })),
});

interface AccountDashboardSessionRow {
  readonly id: string;
  readonly token: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

interface AccountDashboardAccountRow {
  readonly providerId: string;
  readonly accountId: string;
}

interface AccountDashboardRequest {
  readonly platform: { readonly env: AuthEnvironment } | undefined;
  readonly request: { readonly headers: Headers };
  readonly url: URL;
}

interface DashboardProviderSession {
  readonly session: { readonly token: string };
  readonly user: {
    readonly createdAt: Date | string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly id: string;
    readonly image?: string | null | undefined;
    readonly name: string;
  };
}

interface DashboardLookupInput {
  readonly env: AuthEnvironment;
  readonly headers: Headers;
  readonly requestUrl: URL;
}

type DashboardSessionLookup = (
  input: DashboardLookupInput
) => Promise<DashboardProviderSession | null>;

async function lookupDashboardSession({
  env,
  headers,
  requestUrl,
}: DashboardLookupInput): Promise<DashboardProviderSession | null> {
  return createShadowAuth(env, requestUrl).api.getSession({ headers });
}

function dashboardDate(timestamp: Date | number | string): Date {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    error(500, 'Dashboard data unavailable');
  }
  return date;
}

function decodeSessionRows(
  value: DashboardBoundaryInput
): ReadonlyArray<AccountDashboardSessionRow> {
  const decoded = Schema.decodeUnknownExit(Schema.Array(SessionRowSchema))(value);
  if (Exit.isFailure(decoded)) {
    error(500, 'Dashboard data unavailable');
  }
  return decoded.value.map(row => ({
    ...row,
    createdAt: dashboardDate(row.createdAt),
    expiresAt: dashboardDate(row.expiresAt),
  }));
}

function decodeAccountRows(
  value: DashboardBoundaryInput
): ReadonlyArray<AccountDashboardAccountRow> {
  const decoded = Schema.decodeUnknownExit(Schema.Array(AccountRowSchema))(value);
  if (Exit.isFailure(decoded)) {
    error(500, 'Dashboard data unavailable');
  }
  return decoded.value;
}

function decodeDashboardData(value: DashboardBoundaryInput): DashboardData {
  const decoded = Schema.decodeUnknownExit(DashboardDataSchema)(value);
  if (Exit.isFailure(decoded)) {
    error(500, 'Dashboard data unavailable');
  }
  return decoded.value;
}

export interface AccountDashboardIdentity {
  readonly sessionToken: string;
  readonly user: DashboardData['user'];
}

/** Load the current verified Better Auth identity without querying account detail tables. */
export async function loadAccountIdentity(
  event: AccountDashboardRequest,
  lookup: DashboardSessionLookup = lookupDashboardSession
): Promise<AccountDashboardIdentity | null> {
  if (event.platform === undefined) {
    error(503, 'Authentication service unavailable');
  }
  const providerSession = await lookup({
    env: event.platform.env,
    headers: event.request.headers,
    requestUrl: event.url,
  });
  if (providerSession === null) {
    return null;
  }
  return {
    sessionToken: providerSession.session.token,
    user: {
      id: providerSession.user.id,
      name: providerSession.user.name,
      email: providerSession.user.email,
      emailVerified: providerSession.user.emailVerified,
      image: providerSession.user.image ?? null,
      createdAt: dashboardDate(providerSession.user.createdAt).toISOString(),
    },
  };
}

export async function loadAccountDashboard(
  event: AccountDashboardRequest,
  lookup: DashboardSessionLookup = lookupDashboardSession
): Promise<DashboardData | null> {
  const identity = await loadAccountIdentity(event, lookup);
  if (identity === null) {
    return null;
  }
  if (event.platform === undefined) {
    error(503, 'Authentication service unavailable');
  }
  const env = event.platform.env;

  let sessionRows: DashboardBoundaryInput;
  let accountRows: DashboardBoundaryInput;
  try {
    const [sessions, accounts] = await Promise.all([
      env.DB.prepare(SESSION_QUERY).bind(identity.user.id).all(),
      env.DB.prepare(ACCOUNT_QUERY).bind(identity.user.id).all(),
    ]);
    sessionRows = sessions.results;
    accountRows = accounts.results;
  } catch {
    error(503, 'Dashboard service unavailable');
  }

  const sessions = decodeSessionRows(sessionRows);
  const accounts = decodeAccountRows(accountRows);
  return decodeDashboardData({
    user: identity.user,
    sessions: sessions.map(session => ({
      id: session.id,
      ipAddress: normalizedOptionalText(session.ipAddress),
      userAgent: normalizedOptionalText(session.userAgent),
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      isCurrent: session.token === identity.sessionToken,
    })),
    accounts: accounts.map(account => ({
      provider: account.providerId,
      accountId: account.accountId,
    })),
  });
}
