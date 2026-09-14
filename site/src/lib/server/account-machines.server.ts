import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { MachineText } from './shared-schemas.server';
import {
  loadPrivateWorkerPayload,
  loadUserServiceSession,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
} from './licensing-service.server';
import { normalizedOptionalText } from './optional-text.server';
import { reportEffectFailure } from './observability.server';

const MACHINES_RESPONSE_LIMIT = 256 * 1024;

const Timestamp = Schema.String.check(
  Schema.isMaxLength(64),
  Schema.makeFilter(value => Number.isFinite(Date.parse(value)))
);
const AccountMachinesResponseSchema = Schema.Struct({
  license: Schema.Struct({
    max_machines: Schema.Natural.check(Schema.isGreaterThanOrEqualTo(1)),
  }),
  machines: Schema.Array(
    Schema.Struct({
      hostname: Schema.NullOr(MachineText),
      os: Schema.NullOr(MachineText),
      arch: Schema.NullOr(MachineText),
      omg_version: Schema.NullOr(MachineText),
      first_seen_at: Timestamp,
      last_seen_at: Timestamp,
      is_active: Schema.Literal(1),
    })
  ),
});

interface AccountMachines {
  readonly active: number;
  readonly allowance: number;
  readonly machines: ReadonlyArray<{
    readonly hostname: string | null;
    readonly operatingSystem: string | null;
    readonly architecture: string | null;
    readonly version: string | null;
    readonly firstSeenAt: string;
    readonly lastSeenAt: string;
  }>;
}

type AccountMachinesState =
  | { readonly status: 'available'; readonly machines: AccountMachines }
  | { readonly status: 'verification-required' }
  | { readonly status: 'unavailable' };

/** Load descriptive active-machine metadata without persistent machine identifiers. */
function loadAccountMachines(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<AccountMachines, LicensingSummaryError> {
  return Effect.gen(function* () {
    const session = yield* loadUserServiceSession(identity, env);
    const response = yield* loadPrivateWorkerPayload(
      env,
      session,
      '/api/dashboard',
      'account-machines',
      MACHINES_RESPONSE_LIMIT,
      AccountMachinesResponseSchema
    );
    const machines = response.machines.map(machine => ({
      hostname: normalizedOptionalText(machine.hostname),
      operatingSystem: normalizedOptionalText(machine.os),
      architecture: normalizedOptionalText(machine.arch),
      version: normalizedOptionalText(machine.omg_version),
      firstSeenAt: machine.first_seen_at,
      lastSeenAt: machine.last_seen_at,
    }));
    return {
      active: machines.length,
      allowance: response.license.max_machines,
      machines,
    };
  });
}

/** Ground machines into a browser-safe route state with localized degradation. */
export async function loadAccountMachinesState(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Promise<AccountMachinesState> {
  if (!identity.emailVerified) {
    return { status: 'verification-required' };
  }
  const exit = await Effect.runPromiseExit(loadAccountMachines(identity, env));
  if (Exit.isSuccess(exit)) {
    return { status: 'available', machines: exit.value };
  }
  reportEffectFailure('account.machines_unavailable', exit.cause);
  return { status: 'unavailable' };
}
