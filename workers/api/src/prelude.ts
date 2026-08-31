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
 * Compare two UTF-8 strings in constant time for the padded length.
 *
 * Length still affects the padded buffer size; the equality of the original
 * byte lengths is combined with the padded comparison so a mismatch cannot
 * short-circuit on the first differing byte.
 *
 * @param left - First secret.
 * @param right - Second secret.
 * @returns True only when both strings are identical.
 */
export function timingSafeEqualUtf8(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength, 1);
  const leftPadded = new Uint8Array(length);
  const rightPadded = new Uint8Array(length);
  leftPadded.set(leftBytes);
  rightPadded.set(rightBytes);
  return (
    crypto.subtle.timingSafeEqual(leftPadded, rightPadded) &&
    leftBytes.byteLength === rightBytes.byteLength
  );
}
