import * as Schema from 'effect/Schema';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const TableInfoRowsSchema = Schema.Array(
  Schema.Struct({
    name: Schema.String,
  })
);

const MigrationRowsSchema = Schema.Array(
  Schema.Struct({
    name: Schema.String,
  })
);

async function tableColumns(table: string): Promise<ReadonlyArray<string>> {
  const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  return Schema.decodeUnknownSync(TableInfoRowsSchema)(result.results).map(row => row.name);
}

describe('canonical D1 migrations', () => {
  it('applies the baseline and every ordered incremental migration', async () => {
    const result = await env.DB.prepare(
      'SELECT name FROM d1_migrations ORDER BY applied_at, id'
    ).all();
    const migrations = Schema.decodeUnknownSync(MigrationRowsSchema)(result.results).map(
      row => row.name
    );

    expect(migrations).toEqual([
      '0000_current_baseline.sql',
      '011_stripe_event_inbox.sql',
      '012_secure_otp.sql',
    ]);
  });

  it('creates the current authentication and Stripe inbox columns', async () => {
    expect(await tableColumns('auth_codes')).toEqual(
      expect.arrayContaining(['code', 'used', 'attempt_count'])
    );
    expect(await tableColumns('stripe_events')).toEqual(
      expect.arrayContaining(['status', 'attempt_count', 'processing_started_at', 'last_error'])
    );
  });
});
