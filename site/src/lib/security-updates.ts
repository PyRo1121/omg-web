import { Schema } from 'effect';

export const SECURITY_CATEGORIES = [
  'All updates',
  'Tool installs',
  'Packages & runtimes',
  'Website',
  'Delivery & verification',
] as const;
const SecurityUpdateSchema = Schema.Struct({
  sha: Schema.String,
  repository: Schema.Literals(['omg', 'omg-web']),
  title: Schema.String,
  detail: Schema.String,
  date: Schema.String,
  branch: Schema.Literals(['main', 'development']),
  category: Schema.String,
});
export const SecurityFeedSchema = Schema.Struct({
  updates: Schema.Array(SecurityUpdateSchema),
  syncedAt: Schema.String,
  stale: Schema.Boolean,
});
export type SecurityFeed = typeof SecurityFeedSchema.Type;
export type SecurityUpdate = typeof SecurityUpdateSchema.Type;

export function commitHref(update: SecurityUpdate): string {
  return `https://github.com/PyRo1121/${update.repository}/commit/${update.sha}`;
}

export function securityCategory(repository: string, title: string): string {
  if (repository === 'omg-web') return 'Website';
  if (/\btool\b|\bnpm\b|\bcgo\b|manager configuration/iu.test(title)) return 'Tool installs';
  if (/release|qemu|ci\b|provenance|attestation|workflow/iu.test(title))
    return 'Delivery & verification';
  return 'Packages & runtimes';
}

export function isSecurityUpdate(title: string): boolean {
  if (/^Merge\b/iu.test(title)) return false;
  return /^(?:security(?:\([^)]*\))?:|[a-z]+\(security\):)|\bharden(?:ing)?\b|\bsecurity\b|\bprivileges?\b|\bchecksum\b|\bprovenance\b|\battestation\b|roll back failed tool activation/iu.test(
    title
  );
}
