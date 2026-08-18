/**
 * Read a table value by string key without asserting the key type.
 *
 * @param pairs - Own enumerable entries of the lookup table.
 * @param key - Untrusted or loosely typed key.
 * @returns The matching value, or undefined.
 */
export function valueForKey<V>(
  pairs: ReadonlyArray<readonly [string, V]>,
  key: string
): V | undefined {
  return pairs.find(([entryKey]) => entryKey === key)?.[1];
}
