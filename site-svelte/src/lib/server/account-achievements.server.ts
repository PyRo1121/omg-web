import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import {
  loadPrivateWorkerPayload,
  loadUserServiceSession,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
} from './licensing-service.server';
import { reportEffectFailure } from './observability.server';

const ACHIEVEMENTS_RESPONSE_LIMIT = 128 * 1024;
const DisplayText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const Description = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024));
const Timestamp = Schema.String.check(
  Schema.isMaxLength(64),
  Schema.makeFilter(value => Number.isFinite(Date.parse(value)))
);
const AchievementSchema = Schema.Struct({
  id: DisplayText,
  emoji: DisplayText,
  name: DisplayText,
  description: Description,
  unlocked: Schema.Boolean,
  unlocked_at: Schema.NullOr(Timestamp),
}).check(
  Schema.makeFilter(item => (item.unlocked ? item.unlocked_at !== null : item.unlocked_at === null))
);
const AccountAchievementsResponseSchema = Schema.Struct({
  achievements: Schema.Array(AchievementSchema),
});

export interface AccountAchievements {
  readonly unlocked: number;
  readonly total: number;
  readonly achievements: ReadonlyArray<{
    readonly name: string;
    readonly description: string;
    readonly unlocked: boolean;
    readonly unlockedAt: string | null;
  }>;
}

export type AccountAchievementsState =
  | { readonly status: 'available'; readonly achievements: AccountAchievements }
  | { readonly status: 'verification-required' }
  | { readonly status: 'unavailable' };

/** Load the catalog-derived achievement projection for one verified account. */
export function loadAccountAchievements(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<AccountAchievements, LicensingSummaryError> {
  return Effect.gen(function* () {
    const session = yield* loadUserServiceSession(identity, env);
    const response = yield* loadPrivateWorkerPayload(
      env,
      session,
      '/api/dashboard',
      'account-achievements',
      ACHIEVEMENTS_RESPONSE_LIMIT,
      AccountAchievementsResponseSchema
    );
    const achievements = response.achievements.map(item => ({
      name: item.name,
      description: item.description,
      unlocked: item.unlocked,
      unlockedAt: item.unlocked_at,
    }));
    return {
      unlocked: achievements.filter(item => item.unlocked).length,
      total: achievements.length,
      achievements,
    };
  });
}

/** Ground achievements into a browser-safe route state. */
export async function loadAccountAchievementsState(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Promise<AccountAchievementsState> {
  if (!identity.emailVerified) {
    return { status: 'verification-required' };
  }
  const exit = await Effect.runPromiseExit(loadAccountAchievements(identity, env));
  if (Exit.isSuccess(exit)) {
    return { status: 'available', achievements: exit.value };
  }
  reportEffectFailure('account.achievements_unavailable', exit.cause);
  return { status: 'unavailable' };
}
