/**
 * Convert a normalized caught Error into a user-safe message.
 *
 * @param error - A caught value already narrowed to Error.
 * @param fallback - Message shown when the error has no useful message.
 * @returns A non-empty user-facing error message.
 */
export function getErrorMessage(error: Error, fallback: string): string {
  return error.message.length > 0 ? error.message : fallback;
}
