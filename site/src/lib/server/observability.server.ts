import { Cause, Effect, Logger, Option } from 'effect';

interface ServerFailureEvent {
  readonly event: string;
  readonly failureTag: string;
}

/** Emit one sanitized structured warning for a grounded typed Effect failure. */
export function reportEffectFailure<E extends { readonly _tag: string }>(
  event: string,
  cause: Cause.Cause<E>
): void {
  const failure = Cause.findErrorOption(cause);
  const payload: ServerFailureEvent = {
    event,
    failureTag: Option.isSome(failure) ? failure.value._tag : 'UnexpectedDefect',
  };
  Effect.runSync(
    Effect.logWarning(payload).pipe(Effect.provide(Logger.layer([Logger.consoleJson])))
  );
}
