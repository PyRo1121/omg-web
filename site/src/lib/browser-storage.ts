import * as Schema from 'effect/Schema';

type StoredBoundaryInput = Schema.Schema.Encoded<Schema.Schema.Any>;
type StoredValueDecoder<Value> = (value: StoredBoundaryInput) => Value | null;

interface BrowserStorageReader {
  getItem(key: string): string | null;
}

/** Read, bound, parse, and decode an untrusted browser-storage value. */
export function readBoundedStoredValue<Value>(
  storage: BrowserStorageReader,
  key: string,
  maxCharacters: number,
  decode: StoredValueDecoder<Value>
): Value | null {
  try {
    const stored = storage.getItem(key);
    if (stored === null || stored.length > maxCharacters) {
      return null;
    }
    const parsed: StoredBoundaryInput = JSON.parse(stored);
    return decode(parsed);
  } catch {
    // Browser storage and historical values are optional, untrusted inputs.
    return null;
  }
}
