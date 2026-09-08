/** Normalize optional persisted text while preserving an explicit unavailable state. */
export function normalizedOptionalText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
