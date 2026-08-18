// Boundary parser internals walk dotted metric paths on decoded Worker JSON.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get -- Safe nested JSON reads require these operations.

function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a numeric value at a dotted path, or 0 when missing or non-numeric.
 *
 * @param root - Decoded metrics object.
 * @param path - Dotted path such as `engagement.dau`.
 * @returns A finite number.
 */
export function nestedNumber(root: object, path: string): number {
  let current: unknown = root;
  for (const key of path.split('.')) {
    if (!isRecord(current)) {
      return 0;
    }
    current = Reflect.get(current, key);
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : Number(current) || 0;
}
