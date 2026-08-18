/**
 * Narrow segment-builder condition values without asserting the stored union.
 */

function isNumberRange(
  value: string | number | readonly [number, number]
): value is readonly [number, number] {
  return Array.isArray(value);
}

/**
 * Read a scalar filter value, using the lower bound when a range was stored.
 *
 * @param value - Condition value from the builder.
 * @returns A string or number suitable for a single input.
 */
export function scalarConditionValue(
  value: string | number | readonly [number, number]
): string | number {
  if (isNumberRange(value)) {
    return value[0] ?? 0;
  }
  return value;
}

/**
 * Read a between-range, defaulting missing or non-numeric bounds to 0.
 *
 * @param value - Condition value from the builder.
 * @returns A two-number range.
 */
export function betweenRange(value: string | number | readonly [number, number]): [number, number] {
  if (isNumberRange(value)) {
    return [Number(value[0]) || 0, Number(value[1]) || 0];
  }
  const parsed = Number(value);
  const n = Number.isFinite(parsed) ? parsed : 0;
  return [n, n];
}

/**
 * Coerce a SegmentInput change into a finite number.
 *
 * @param value - String or number from the input.
 * @returns A finite number, or 0.
 */
export function numericInputValue(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
