import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import { readBoundedStoredValue } from './browser-storage';

const PreferencesSchema = Schema.Struct({ theme: Schema.Literal('dark', 'light') });

describe('bounded browser storage', () => {
  it('decodes a valid value within the configured character limit', () => {
    const stored = JSON.stringify({ theme: 'dark' });
    const storage = { getItem: () => stored };

    const result = readBoundedStoredValue(storage, 'preferences', stored.length, value => {
      const decoded = Schema.decodeUnknownEither(PreferencesSchema)(value);
      return decoded._tag === 'Right' ? decoded.right : null;
    });

    expect(result).toEqual({ theme: 'dark' });
  });

  it('rejects oversized input before invoking JSON parsing or the decoder', () => {
    const storage = { getItem: () => '{'.repeat(33) };
    let decoderCalled = false;

    const result = readBoundedStoredValue(storage, 'preferences', 32, () => {
      decoderCalled = true;
      return { theme: 'dark' as const };
    });

    expect(result).toBeNull();
    expect(decoderCalled).toBe(false);
  });

  it('rejects malformed JSON, invalid schemas, and unavailable storage', () => {
    const malformed = { getItem: () => '{' };
    const invalid = { getItem: () => JSON.stringify({ theme: 'system' }) };
    const unavailable = {
      getItem: () => {
        throw new Error('storage unavailable');
      },
    };
    const decode = (value: Schema.Schema.Encoded<Schema.Schema.Any>) => {
      const decoded = Schema.decodeUnknownEither(PreferencesSchema)(value);
      return decoded._tag === 'Right' ? decoded.right : null;
    };

    expect(readBoundedStoredValue(malformed, 'preferences', 32, decode)).toBeNull();
    expect(readBoundedStoredValue(invalid, 'preferences', 32, decode)).toBeNull();
    expect(readBoundedStoredValue(unavailable, 'preferences', 32, decode)).toBeNull();
  });
});
