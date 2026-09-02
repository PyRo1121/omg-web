/**
 * Data retention periods. The privacy disclosure and the cleanup jobs must
 * recite the same numbers, so both read them from this module.
 */

/** Security audit log rows. */
export const AUDIT_LOG_RETENTION_DAYS = 30;

/** Raw CLI telemetry event rows. */
export const CLI_TELEMETRY_RETENTION_DAYS = 90;

/** Documentation analytics event rows. */
export const DOCS_EVENT_RETENTION_DAYS = 7;

/** Documentation analytics session rows. */
export const DOCS_SESSION_RETENTION_DAYS = 30;

/** Public website analytics event rows. */
export const SITE_ANALYTICS_RETENTION_DAYS = 90;

/** Introductory-offer lead rows and aggregate usage statistics. */
export const USAGE_RETENTION_MONTHS = 12;

/** Stripe event inbox rows. */
export const STRIPE_EVENT_RETENTION_DAYS = 90;
