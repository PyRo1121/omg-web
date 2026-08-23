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

/** Create a note; returns its id. */
export const createNote = (
  db: D1Database,
  input: {
    readonly customerId: string;
    readonly content: string;
    readonly noteType: string;
    readonly authorId: string;
  }
): Effect.Effect<string, CrmStoreError> =>
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
  });

/** Partially update a note; only provided fields change. */
export const updateNote = (
  db: D1Database,
  input: {
    readonly noteId: string;
    readonly content?: string;
    readonly isPinned?: boolean;
  }
): Effect.Effect<void, CrmStoreError> =>
  Effect.tryPromise({
    try: () => {
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
      return db
        .prepare(`UPDATE customer_notes SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params)
        .run();
    },
    catch: fail('updateNote'),
  }).pipe(Effect.asVoid);

/** Delete a note by id. */
export const deleteNote = (db: D1Database, noteId: string): Effect.Effect<void, CrmStoreError> =>
  Effect.tryPromise({
    try: () => db.prepare(`DELETE FROM customer_notes WHERE id = ?`).bind(noteId).run(),
    catch: fail('deleteNote'),
  }).pipe(Effect.asVoid);

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
 */
export const assignTag = (
  db: D1Database,
  input: {
    readonly customerId: string;
    readonly tagId: string;
    readonly assignedBy: string;
  }
): Effect.Effect<'created' | 'already-assigned', CrmStoreError> =>
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
    Effect.catchIf(
      (error: CrmStoreError) => {
        const message = String(error.cause);
        return message.includes('UNIQUE constraint') || message.includes('PRIMARY KEY');
      },
      () => Effect.succeed('already-assigned' as const)
    )
  );

/** Remove a tag assignment. */
export const removeTag = (
  db: D1Database,
  customerId: string,
  tagId: string
): Effect.Effect<void, CrmStoreError> =>
  Effect.tryPromise({
    try: () =>
      db
        .prepare(`DELETE FROM customer_tag_assignments WHERE customer_id = ? AND tag_id = ?`)
        .bind(customerId, tagId)
        .run(),
    catch: fail('removeTag'),
  }).pipe(Effect.asVoid);
