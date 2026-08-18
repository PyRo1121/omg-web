// Boundary parser internals read PerformanceEntry fields the DOM types do not expose uniformly.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get -- Safe performance-entry parsing requires these operations.

function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function field(value: object, name: string): unknown {
  return Reflect.get(value, name);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Duration from start to processing start (first-input / FID-style).
 *
 * @param entry - Untrusted performance entry.
 * @returns Milliseconds, or undefined when the fields are missing.
 */
export function inputDelayMs(entry: unknown): number | undefined {
  if (!isRecord(entry)) {
    return undefined;
  }
  const startTime = finiteNumber(field(entry, 'startTime'));
  const processingStart = finiteNumber(field(entry, 'processingStart'));
  if (startTime === undefined || processingStart === undefined) {
    return undefined;
  }
  return processingStart - startTime;
}

/**
 * Duration from start to processing end (event / INP-style).
 *
 * @param entry - Untrusted performance entry.
 * @returns Milliseconds, or undefined when the fields are missing.
 */
export function interactionMs(entry: unknown): number | undefined {
  if (!isRecord(entry)) {
    return undefined;
  }
  const startTime = finiteNumber(field(entry, 'startTime'));
  const processingEnd = finiteNumber(field(entry, 'processingEnd'));
  if (startTime === undefined || processingEnd === undefined) {
    return undefined;
  }
  return processingEnd - startTime;
}

/**
 * Layout-shift score, ignoring shifts that follow recent input.
 *
 * @param entry - Untrusted performance entry.
 * @returns The shift value, or undefined when it should not count.
 */
export function layoutShiftDelta(entry: unknown): number | undefined {
  if (!isRecord(entry) || field(entry, 'hadRecentInput') === true) {
    return undefined;
  }
  return finiteNumber(field(entry, 'value'));
}

/**
 * TTFB from the first navigation timing entry.
 *
 * @param entries - `performance.getEntriesByType('navigation')`.
 * @returns Milliseconds, or undefined when timing fields are missing.
 */
export function navigationTtfbMs(entries: ReadonlyArray<unknown>): number | undefined {
  const entry = entries[0];
  if (!isRecord(entry)) {
    return undefined;
  }
  const responseStart = finiteNumber(field(entry, 'responseStart'));
  const requestStart = finiteNumber(field(entry, 'requestStart'));
  if (responseStart === undefined || requestStart === undefined) {
    return undefined;
  }
  return responseStart - requestStart;
}
