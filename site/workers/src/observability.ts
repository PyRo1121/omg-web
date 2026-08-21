import { Effect } from 'effect';

/** Emit a structured Worker error through Effect's runtime logger. */
export function reportError(message: string, cause?: unknown): void {
  Effect.runSync(Effect.logError(message, cause));
}

/** Emit a structured Worker warning through Effect's runtime logger. */
export function reportWarning(message: string, cause?: unknown): void {
  Effect.runSync(Effect.logWarning(message, cause));
}

/** Emit a structured Worker information event through Effect's runtime logger. */
export function reportInfo(message: string): void {
  Effect.runSync(Effect.logInfo(message));
}
