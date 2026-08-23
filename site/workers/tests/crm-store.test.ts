import '../src/cloudflare-test.d.ts';
import { Effect } from 'effect';
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

import {
  assignTag,
  createNote,
  createTag,
  deleteNote,
  listCustomerTags,
  listNotes,
  listTagCatalog,
  removeTag,
  updateNote,
} from '../src/store/crm';

const AUTHOR_ID = 'crm-store-customer';

// Reuse one seeded customer for both note authorship and tag targets.
const CUSTOMER_ID = AUTHOR_ID;

async function ensureSchema(): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customer_notes (
       id TEXT PRIMARY KEY,
       customer_id TEXT NOT NULL,
       author_id TEXT,
       note_type TEXT,
       content TEXT NOT NULL,
       is_pinned INTEGER DEFAULT 0,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customer_tags (
       id TEXT PRIMARY KEY,
       name TEXT UNIQUE NOT NULL,
       color TEXT,
       description TEXT,
       created_by TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customer_tag_assignments (
       customer_id TEXT NOT NULL,
       tag_id TEXT NOT NULL,
       assigned_by TEXT,
       assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (customer_id, tag_id)
     )`
  ).run();
}

describe('CRM store', () => {
  beforeEach(async () => {
    await ensureSchema();
    await env.DB.prepare(`DELETE FROM customer_notes WHERE customer_id = ?`)
      .bind(CUSTOMER_ID)
      .run();
    await env.DB.prepare(`DELETE FROM customer_tag_assignments`).run();
    await env.DB.prepare(`DELETE FROM customer_tags WHERE name LIKE 'store-test-%'`).run();
    // Notes/tags carry FK constraints onto customers.
    await env.DB.prepare(`INSERT OR IGNORE INTO customers (id, email) VALUES (?, ?)`)
      .bind(CUSTOMER_ID, 'crm-store@example.com')
      .run();
  });

  it('createNote persists a note and listNotes returns it', async () => {
    const noteId = await Effect.runPromise(
      createNote(env.DB, {
        customerId: CUSTOMER_ID,
        content: 'First note',
        noteType: 'general',
        authorId: CUSTOMER_ID,
      })
    );
    expect(noteId).toBeTruthy();

    const notes = await Effect.runPromise(listNotes(env.DB, CUSTOMER_ID));
    expect(notes).toHaveLength(1);
    expect(notes[0]?.id).toBe(noteId);
    expect(notes[0]?.content).toBe('First note');
    expect(notes[0]?.customer_id).toBe(CUSTOMER_ID);
  });

  it('updateNote changes only provided fields', async () => {
    const noteId = await Effect.runPromise(
      createNote(env.DB, {
        customerId: CUSTOMER_ID,
        content: 'Before',
        noteType: 'general',
        authorId: CUSTOMER_ID,
      })
    );
    await Effect.runPromise(updateNote(env.DB, { noteId, isPinned: true }));

    const notes = await Effect.runPromise(listNotes(env.DB, CUSTOMER_ID));
    expect(notes[0]?.is_pinned).toBe(1);
    expect(notes[0]?.content).toBe('Before');
  });

  it('deleteNote removes the note', async () => {
    const noteId = await Effect.runPromise(
      createNote(env.DB, {
        customerId: CUSTOMER_ID,
        content: 'Doomed',
        noteType: 'general',
        authorId: CUSTOMER_ID,
      })
    );
    await Effect.runPromise(deleteNote(env.DB, noteId));
    const notes = await Effect.runPromise(listNotes(env.DB, CUSTOMER_ID));
    expect(notes).toHaveLength(0);
  });

  it('createTag + listTagCatalog expose usage counts', async () => {
    const tagId = await Effect.runPromise(createTag(env.DB, { name: 'vip' }));
    await Effect.runPromise(
      assignTag(env.DB, { customerId: CUSTOMER_ID, tagId, assignedBy: 'admin' })
    );

    const catalog = await Effect.runPromise(listTagCatalog(env.DB));
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.name).toBe('vip');
    expect(catalog[0]?.usage_count).toBe(1);
  });

  it('assignTag is idempotent on reassignment', async () => {
    const tagId = await Effect.runPromise(createTag(env.DB, { name: 'churn-risk' }));
    const first = await Effect.runPromise(
      assignTag(env.DB, { customerId: CUSTOMER_ID, tagId, assignedBy: 'admin' })
    );
    const second = await Effect.runPromise(
      assignTag(env.DB, { customerId: CUSTOMER_ID, tagId, assignedBy: 'admin' })
    );
    expect(first).toBe('created');
    expect(second).toBe('already-assigned');

    const tags = await Effect.runPromise(listCustomerTags(env.DB, CUSTOMER_ID));
    expect(tags).toHaveLength(1);
  });

  it('removeTag unassigns the customer', async () => {
    const tagId = await Effect.runPromise(createTag(env.DB, { name: 'enterprise' }));
    await Effect.runPromise(
      assignTag(env.DB, { customerId: CUSTOMER_ID, tagId, assignedBy: 'admin' })
    );
    await Effect.runPromise(removeTag(env.DB, CUSTOMER_ID, tagId));

    const tags = await Effect.runPromise(listCustomerTags(env.DB, CUSTOMER_ID));
    expect(tags).toHaveLength(0);
  });
});
