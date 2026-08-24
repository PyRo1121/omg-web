/**
 * Tag colors arrive from the API as unvalidated strings (the worker accepts any
 * string today), yet they are rendered into inline style objects. Restricting
 * them to plain hex values here removes the CSS-injection sink (`url(...)`,
 * property smuggling) and guarantees the `${color}NN` alpha-suffix concats
 * below always produce valid colors.
 */

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Parse an untrusted tag color into a safe hex value, falling back when invalid. */
export function parseTagColor(value: string | null | undefined, fallback: string): string {
  return value !== null && value !== undefined && HEX_COLOR_PATTERN.test(value) ? value : fallback;
}

/** Translucent chip background derived from an already-parsed hex color. */
export function tagChipBackground(color: string): string {
  return `${color}20`;
}

/** Chip border derived from an already-parsed hex color. */
export function tagChipBorder(color: string): string {
  return `1px solid ${color}30`;
}
