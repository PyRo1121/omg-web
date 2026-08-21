import * as Sentry from '@sentry/solid';

/** Capture a browser failure with a stable operation label. */
export function reportClientError(message: string, cause?: unknown): void {
  const error = cause instanceof Error ? cause : new Error(message, { cause });
  Sentry.captureException(error, { extra: { operation: message } });
}

/** Capture a recoverable browser warning without writing debug console output. */
export function reportClientWarning(message: string, cause?: unknown): void {
  if (cause === undefined) {
    Sentry.captureMessage(message, 'warning');
    return;
  }
  const error = cause instanceof Error ? cause : new Error(message, { cause });
  Sentry.captureException(error, {
    level: 'warning',
    extra: { operation: message },
  });
}
