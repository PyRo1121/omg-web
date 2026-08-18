/**
 * Exhaustiveness helper for tagged unions. Passing a remaining value is a
 * compile-time error; reaching this at runtime is a defect.
 *
 * @param unexpectedCase - A value the compiler proves cannot exist.
 * @returns Never returns.
 */
export function casesHandled(unexpectedCase: never): never {
  throw new Error(`Unhandled case: ${String(unexpectedCase)}`);
}

/**
 * Abort on a violated internal invariant.
 *
 * @param msg - Optional description of the invariant that failed.
 * @returns Never returns.
 */
export function shouldNeverHappen(msg?: string): never {
  throw new Error(msg ?? 'This should never happen');
}
