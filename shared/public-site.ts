export const SITE_HOSTNAME = 'getomg.xyz';
export const SITE_ORIGIN = `https://${SITE_HOSTNAME}`;

type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLdValue[]
  | { readonly [key: string]: JsonLdValue };

/** Serialize structured data without permitting an HTML script-text breakout. */
export function serializeJsonLd(value: JsonLdValue): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}
