import * as Sentry from '@sentry/solid';

/** Capture a browser failure with a stable operation label. */
export function reportClientError(message: string, cause?: unknown): void {
  const error = cause instanceof Error ? cause : new Error(message, { cause });
  Sentry.captureException(error, { extra: { operation: message } });
}
