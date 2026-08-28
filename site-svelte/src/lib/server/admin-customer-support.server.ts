import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import type {
  AdminCustomerCatalogTag,
  AdminCustomerCollectionState,
  AdminCustomerHealth,
  AdminCustomerHealthState,
  AdminCustomerNote,
  AdminCustomerSupport,
  AdminCustomerTag,
  AdminCustomerWorkspace,
} from '../../../../site/shared/admin-customers';
import { loadAdminCustomerDetailById, resolveAdminCustomerId } from './admin-customers.server';
import {
  AdminOverviewForbidden,
  loadAdminServiceSession,
  loadPrivateWorkerPayload,
  type LicensingServiceSession,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
  LicensingSummaryWorkerRejected,
} from './licensing-service.server';
import { normalizedOptionalText } from './optional-text.server';

const SUPPORT_RESPONSE_LIMIT = 128 * 1024;
const ShortText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const NoteContent = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096));
const Timestamp = ShortText.check(Schema.makeFilter(value => Number.isFinite(Date.parse(value))));
const OptionalTimestamp = Schema.NullOr(Timestamp);
const OptionalText = Schema.NullOr(ShortText);
const Score = Schema.Number.check(
  Schema.makeFilter(value => Number.isFinite(value) && value >= 0 && value <= 100)
);
const TagColor = Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/u));

const HealthResponseSchema = Schema.Struct({
  health: Schema.Struct({
    overall_score: Score,
    engagement_score: Score,
    activation_score: Score,
    growth_score: Score,
    risk_score: Score,
    lifecycle_stage: ShortText,
    updated_at: OptionalTimestamp,
  }),
});
const NotesResponseSchema = Schema.Struct({
  notes: Schema.Array(
    Schema.Struct({
      note_type: OptionalText,
      content: NoteContent,
      is_pinned: Schema.Literals([0, 1]),
      created_at: Timestamp,
      updated_at: OptionalTimestamp,
      author_email: Schema.optional(OptionalText),
    })
  ),
});
const AssignedTagsResponseSchema = Schema.Struct({
  tags: Schema.Array(
    Schema.Struct({
      name: ShortText,
      color: Schema.NullOr(TagColor),
      description: OptionalText,
    })
  ),
});
const TagCatalogResponseSchema = Schema.Struct({
  tags: Schema.Array(
    Schema.Struct({
      name: ShortText,
      color: Schema.NullOr(TagColor),
      description: OptionalText,
      usage_count: Schema.Natural,
    })
  ),
});

function availableCollection<T>(
  effect: Effect.Effect<ReadonlyArray<T>, LicensingSummaryError>
): Effect.Effect<AdminCustomerCollectionState<T>> {
  return effect.pipe(
    Effect.match({
      onFailure: () => ({ kind: 'unavailable' as const }),
      onSuccess: values => ({ kind: 'available' as const, values }),
    })
  );
}

function availableHealth(
  effect: Effect.Effect<AdminCustomerHealth, LicensingSummaryError>
): Effect.Effect<AdminCustomerHealthState> {
  return effect.pipe(
    Effect.match({
      onFailure: failure =>
        failure instanceof LicensingSummaryWorkerRejected && failure.status === 404
          ? { kind: 'empty' as const }
          : { kind: 'unavailable' as const },
      onSuccess: value => ({ kind: 'available' as const, value }),
    })
  );
}

function loadAdminCustomerSupportById(
  env: LicensingSummaryEnvironment,
  session: LicensingServiceSession,
  customerId: string
): Effect.Effect<AdminCustomerSupport> {
  return Effect.gen(function* () {
    const customerQuery = new URLSearchParams({ customerId }).toString();

    const health = availableHealth(
      loadPrivateWorkerPayload(
        env,
        session,
        `/api/admin/customer-health?${customerQuery}`,
        'admin-customer-health',
        SUPPORT_RESPONSE_LIMIT,
        HealthResponseSchema
      ).pipe(
        Effect.map((payload): AdminCustomerHealth => ({
          overallScore: payload.health.overall_score,
          engagementScore: payload.health.engagement_score,
          activationScore: payload.health.activation_score,
          growthScore: payload.health.growth_score,
          riskScore: payload.health.risk_score,
          lifecycleStage: payload.health.lifecycle_stage,
          updatedAt: payload.health.updated_at,
        }))
      )
    );
    const notes = availableCollection(
      loadPrivateWorkerPayload(
        env,
        session,
        `/api/admin/notes?${customerQuery}`,
        'admin-customer-notes',
        SUPPORT_RESPONSE_LIMIT,
        NotesResponseSchema
      ).pipe(
        Effect.map(payload =>
          payload.notes.map((note): AdminCustomerNote => ({
            content: note.content,
            noteType: normalizedOptionalText(note.note_type) ?? 'general',
            pinned: note.is_pinned === 1,
            authorEmail: normalizedOptionalText(note.author_email ?? null),
            createdAt: note.created_at,
            updatedAt: note.updated_at,
          }))
        )
      )
    );
    const assignedTags = availableCollection(
      loadPrivateWorkerPayload(
        env,
        session,
        `/api/admin/customer-tags?${customerQuery}`,
        'admin-customer-tags',
        SUPPORT_RESPONSE_LIMIT,
        AssignedTagsResponseSchema
      ).pipe(
        Effect.map(payload =>
          payload.tags.map((tag): AdminCustomerTag => ({
            name: tag.name,
            color: tag.color ?? '#6366f1',
            description: normalizedOptionalText(tag.description),
          }))
        )
      )
    );
    const tagCatalog = availableCollection(
      loadPrivateWorkerPayload(
        env,
        session,
        '/api/admin/tags',
        'admin-tag-catalog',
        SUPPORT_RESPONSE_LIMIT,
        TagCatalogResponseSchema
      ).pipe(
        Effect.map(payload =>
          payload.tags.map((tag): AdminCustomerCatalogTag => ({
            name: tag.name,
            color: tag.color ?? '#6366f1',
            description: normalizedOptionalText(tag.description),
            usageCount: tag.usage_count,
          }))
        )
      )
    );

    return yield* Effect.all(
      { health, notes, assignedTags, tagCatalog },
      { concurrency: 'unbounded' }
    );
  });
}

/** Load localized, browser-safe CRM support state for one selected customer. */
export function loadAdminCustomerSupport(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  email: string
): Effect.Effect<AdminCustomerSupport, LicensingSummaryError | AdminOverviewForbidden> {
  return Effect.gen(function* () {
    const session = yield* loadAdminServiceSession(identity, env);
    const customerId = yield* resolveAdminCustomerId(email, env);
    return yield* loadAdminCustomerSupportById(env, session, customerId);
  });
}

/** Load customer detail and CRM state through one admin session and customer resolution. */
export function loadAdminCustomerWorkspace(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  email: string
): Effect.Effect<AdminCustomerWorkspace, LicensingSummaryError | AdminOverviewForbidden> {
  return Effect.gen(function* () {
    const session = yield* loadAdminServiceSession(identity, env);
    const customerId = yield* resolveAdminCustomerId(email, env);
    return yield* Effect.all(
      {
        detail: loadAdminCustomerDetailById(env, session, customerId),
        support: loadAdminCustomerSupportById(env, session, customerId),
      },
      { concurrency: 'unbounded' }
    );
  });
}
