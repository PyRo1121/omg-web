import { Effect, Logger } from 'effect';

const MAX_ERROR_DESCRIPTION_LENGTH = 1_000;

interface WorkerLogEvent {
  readonly event: string;
  readonly error?: string;
}

function logEvent(event: string, cause?: unknown): WorkerLogEvent {
  if (cause === undefined) {
    return { event };
  }

  const description = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  return { event, error: description.slice(0, MAX_ERROR_DESCRIPTION_LENGTH) };
}

function emit(effect: Effect.Effect<void>): void {
  Effect.runSync(effect.pipe(Effect.provide(Logger.json)));
}

/** Emit a structured JSON Worker error through Effect's runtime logger. */
export function reportError(event: string, cause?: unknown): void {
  emit(Effect.logError(logEvent(event, cause)));
}

/** Emit a structured JSON Worker warning through Effect's runtime logger. */
export function reportWarning(event: string, cause?: unknown): void {
  emit(Effect.logWarning(logEvent(event, cause)));
}

/** Emit a structured JSON Worker information event through Effect's runtime logger. */
export function reportInfo(event: string): void {
  emit(Effect.logInfo(logEvent(event)));
}
