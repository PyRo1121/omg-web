/**
 * CRM store: customer notes and tags persistence.
 *
 * All D1 access and row decoding for the admin CRM surface lives here so
 * handlers stay thin HTTP adapters and store behavior is testable without
 * HTTP or admin auth.
 */
import type * as Schema from 'effect/Schema';
import { Effect } from 'effect';

import {
  AdminCustomerTagRowSchema,
  AdminNoteRowSchema,
  AdminTagCatalogRowSchema,
  decodeExtraRowArray,
} from '../contracts/d1-extras';

/** A CRM store operation failed (storage or row-shape error). */
class CrmStoreError extends Error {
  readonly _tag = 'CrmStoreError';
  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`CRM store operation failed: ${operation}`);
  }
}

/** A CRM mutation referenced a customer or tag that does not exist. */
class CrmTargetMissingError extends Error {
  readonly _tag = 'CrmTargetMissingError';
  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`CRM mutation target does not exist: ${operation}`);
  }
}

/** Extract a lowercase SQLite error message from a store failure. */
const sqliteMessage = (error: CrmStoreError): string => {
  const cause = error.cause;
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return message.toLowerCase();
};

const isUniqueConstraint = (error: CrmStoreError): boolean => {
  const message = sqliteMessage(error);
  return message.includes('unique constraint') || message.includes('primary key');
};

const isForeignKeyConstraint = (error: CrmStoreError): boolean =>
  sqliteMessage(error).includes('foreign key constraint');

const fail = (operation: string) => (cause: unknown) => new CrmStoreError(operation, cause);

function listRows<S extends Schema.Schema.AnyNoContext>(
  db: D1Database,
  operation: string,
  schema: S,
  reason: string,
  sql: string,
  params: ReadonlyArray<string> = []
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, CrmStoreError> {
  return Effect.tryPromise({
    try: () => {
      const statement = db.prepare(sql);
      return (params.length === 0 ? statement : statement.bind(...params)).all();
    },
    catch: fail(operation),
  }).pipe(
    Effect.flatMap(result => decodeExtraRowArray(schema, reason, result.results ?? [])),
    Effect.mapError(cause => new CrmStoreError(`${operation}:decode`, cause))
  );
}

/** All notes for one customer, pinned first then newest. */
export const listNotes = (db: D1Database, customerId: string) =>
  listRows(
    db,
    'listNotes',
    AdminNoteRowSchema,
    'Admin note row has an invalid shape',
    `SELECT n.id, n.customer_id, n.author_id, n.note_type, n.content, n.is_pinned, n.created_at, n.updated_at, c.email as author_email
     FROM customer_notes n
     LEFT JOIN customers c ON n.author_id = c.id
     WHERE n.customer_id = ?
     ORDER BY n.is_pinned DESC, n.created_at DESC`,
    [customerId]
  );

/**
 * Create a note; returns its id.
 *
 * Fails with {@link CrmTargetMissingError} when `customerId` does not exist.
 */
export const createNote = (
  db: D1Database,
  input: {
    readonly customerId: string;
    readonly content: string;
    readonly noteType: string;
    readonly authorId: string;
  }
): Effect.Effect<string, CrmStoreError | CrmTargetMissingError> =>
  Effect.tryPromise({
    try: async () => {
      const noteId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO customer_notes (id, customer_id, content, note_type, author_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
        .bind(noteId, input.customerId, input.content, input.noteType, input.authorId)
        .run();
      return noteId;
    },
    catch: fail('createNote'),
  }).pipe(
    Effect.catchIf(isForeignKeyConstraint, error =>
      Effect.fail(new CrmTargetMissingError(error.operation, error.cause))
    )
  );

/**
 * Partially update a note; only provided fields change.
 *
 * Reports `'not-found'` when no note with `noteId` exists so callers can
 * respond 404 instead of auditing a mutation that never happened.
 */
export const updateNote = (
  db: D1Database,
  input: {
    readonly noteId: string;
    readonly content?: string;
    readonly isPinned?: boolean;
  }
): Effect.Effect<'updated' | 'not-found', CrmStoreError> =>
  Effect.tryPromise({
    try: async () => {
      const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const params: (string | number)[] = [];
      if (input.content !== undefined) {
        updates.push('content = ?');
        params.push(input.content);
      }
      if (input.isPinned !== undefined) {
        updates.push('is_pinned = ?');
        params.push(input.isPinned ? 1 : 0);
      }
      params.push(input.noteId);
      const updated = await db
        .prepare(`UPDATE customer_notes SET ${updates.join(', ')} WHERE id = ? RETURNING id`)
        .bind(...params)
        .first();
      return updated === null ? 'not-found' : 'updated';
    },
    catch: fail('updateNote'),
  });

/**
 * Delete a note by id.
 *
 * Reports `'not-found'` when no note with `noteId` exists so callers can
 * respond 404 instead of auditing a deletion that never happened.
 */
export const deleteNote = (
  db: D1Database,
  noteId: string
): Effect.Effect<'deleted' | 'not-found', CrmStoreError> =>
  Effect.tryPromise({
    try: async () => {
      const deleted = await db
        .prepare(`DELETE FROM customer_notes WHERE id = ? RETURNING id`)
        .bind(noteId)
        .first();
      return deleted === null ? 'not-found' : 'deleted';
    },
    catch: fail('deleteNote'),
  });

/** Full tag catalog with usage counts. */
export const listTagCatalog = (db: D1Database) =>
  listRows(
    db,
    'listTagCatalog',
    AdminTagCatalogRowSchema,
    'Admin tag catalog row has an invalid shape',
    `SELECT t.id, t.name, t.color, t.description, t.created_by, t.created_at, COUNT(cta.customer_id) as usage_count
     FROM customer_tags t
     LEFT JOIN customer_tag_assignments cta ON t.id = cta.tag_id
     GROUP BY t.id
     ORDER BY t.name ASC`
  );

/** Tags assigned to one customer. */
export const listCustomerTags = (db: D1Database, customerId: string) =>
  listRows(
    db,
    'listCustomerTags',
    AdminCustomerTagRowSchema,
    'Admin customer tag row has an invalid shape',
    `SELECT t.id, t.name, t.color, t.description, t.created_by, t.created_at FROM customer_tags t
     JOIN customer_tag_assignments cta ON t.id = cta.tag_id
     WHERE cta.customer_id = ?
     ORDER BY t.name ASC`,
    [customerId]
  );

/** Create a tag; returns its id. */
export const createTag = (
  db: D1Database,
  input: {
    readonly name: string;
    readonly color?: string;
    readonly description?: string;
  }
): Effect.Effect<string, CrmStoreError> =>
  Effect.tryPromise({
    try: async () => {
      const tagId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO customer_tags (id, name, color, description, created_at)
                  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
        )
        .bind(tagId, input.name, input.color ?? '#6366f1', input.description ?? null)
        .run();
      return tagId;
    },
    catch: fail('createTag'),
  });

/**
 * Assign a tag to a customer. Idempotent: re-assignment reports
 * `'already-assigned'` instead of failing on the uniqueness constraint.
 *
 * Fails with {@link CrmTargetMissingError} when `customerId` or `tagId`
 * does not exist.
 */
export const assignTag = (
  db: D1Database,
  input: {
    readonly customerId: string;
    readonly tagId: string;
    readonly assignedBy: string;
  }
): Effect.Effect<'created' | 'already-assigned', CrmStoreError | CrmTargetMissingError> =>
  Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `INSERT INTO customer_tag_assignments (customer_id, tag_id, assigned_by, assigned_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
        )
        .bind(input.customerId, input.tagId, input.assignedBy)
        .run(),
    catch: fail('assignTag'),
  }).pipe(
    Effect.map(() => 'created' as const),
    Effect.catchIf(isUniqueConstraint, () => Effect.succeed('already-assigned' as const)),
    Effect.catchIf(isForeignKeyConstraint, error =>
      Effect.fail(new CrmTargetMissingError(error.operation, error.cause))
    )
  );

/**
 * Remove a tag assignment.
 *
 * Reports `'not-found'` when no assignment between the customer and the tag
 * exists so callers can respond 404 instead of auditing a removal that never
 * happened.
 */
export const removeTag = (
  db: D1Database,
  customerId: string,
  tagId: string
): Effect.Effect<'removed' | 'not-found', CrmStoreError> =>
  Effect.tryPromise({
    try: async () => {
      const removed = await db
        .prepare(
          `DELETE FROM customer_tag_assignments
           WHERE customer_id = ? AND tag_id = ?
           RETURNING tag_id`
        )
        .bind(customerId, tagId)
        .first();
      return removed === null ? 'not-found' : 'removed';
    },
    catch: fail('removeTag'),
  });
