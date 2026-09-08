import { Exit } from 'effect';
import * as Schema from 'effect/Schema';

interface InputTimingCandidate {
  readonly startTime?: number;
  readonly processingStart?: number;
}

interface InteractionTimingCandidate {
  readonly startTime?: number;
  readonly processingEnd?: number;
}

interface LayoutShiftCandidate {
  readonly startTime?: number;
  readonly value?: number;
  readonly hadRecentInput?: boolean;
}

interface NavigationTimingCandidate {
  readonly startTime?: number;
  readonly responseStart?: number;
}

const FiniteNumber = Schema.Number.check(Schema.makeFilter(Number.isFinite));
const InputTimingSchema = Schema.Struct({ startTime: FiniteNumber, processingStart: FiniteNumber });
const InteractionTimingSchema = Schema.Struct({
  startTime: FiniteNumber,
  processingEnd: FiniteNumber,
});
const LayoutShiftSchema = Schema.Struct({ value: FiniteNumber, hadRecentInput: Schema.Boolean });
const NavigationTimingSchema = Schema.Struct({
  startTime: FiniteNumber,
  responseStart: FiniteNumber,
});

/** Duration from start to processing start (first-input / FID-style). */
export function inputDelayMs(entry: InputTimingCandidate): number | undefined {
  const decoded = Schema.decodeUnknownExit(InputTimingSchema)(entry);
  return Exit.isSuccess(decoded)
    ? Math.max(0, decoded.value.processingStart - decoded.value.startTime)
    : undefined;
}

/** Duration from start to processing end (event / INP-style). */
export function interactionMs(entry: InteractionTimingCandidate): number | undefined {
  const decoded = Schema.decodeUnknownExit(InteractionTimingSchema)(entry);
  return Exit.isSuccess(decoded)
    ? Math.max(0, decoded.value.processingEnd - decoded.value.startTime)
    : undefined;
}

/** Layout-shift score, excluding shifts that follow recent input. */
export function layoutShiftDelta(entry: LayoutShiftCandidate): number | undefined {
  const decoded = Schema.decodeUnknownExit(LayoutShiftSchema)(entry);
  if (Exit.isFailure(decoded) || decoded.value.hadRecentInput) return undefined;
  return decoded.value.value;
}

/** TTFB from the first navigation timing entry. */
export function navigationTtfbMs(
  entries: ReadonlyArray<NavigationTimingCandidate>
): number | undefined {
  const firstEntry = entries[0];
  if (firstEntry === undefined) return undefined;
  const decoded = Schema.decodeUnknownExit(NavigationTimingSchema)({
    startTime: firstEntry.startTime,
    responseStart: firstEntry.responseStart,
  });
  return Exit.isSuccess(decoded)
    ? Math.max(0, decoded.value.responseStart - decoded.value.startTime)
    : undefined;
}
