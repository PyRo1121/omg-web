import * as Schema from 'effect/Schema';

/** Raw Performance API entry accepted only at a Schema boundary. */
type PerformanceBoundaryInput = Schema.Schema.Encoded<Schema.Schema.Any>;

const FiniteNumber = Schema.Number.pipe(Schema.finite());
const InputTimingSchema = Schema.Struct({
  startTime: FiniteNumber,
  processingStart: FiniteNumber,
});
const InteractionTimingSchema = Schema.Struct({
  startTime: FiniteNumber,
  processingEnd: FiniteNumber,
});
const LayoutShiftSchema = Schema.Struct({
  value: FiniteNumber,
  hadRecentInput: Schema.Boolean,
});
const NavigationTimingSchema = Schema.Struct({
  requestStart: FiniteNumber,
  responseStart: FiniteNumber,
});

/** Duration from start to processing start (first-input / FID-style). */
export function inputDelayMs(entry: PerformanceBoundaryInput): number | undefined {
  const decoded = Schema.decodeUnknownEither(InputTimingSchema)(entry);
  return decoded._tag === 'Right'
    ? Math.max(0, decoded.right.processingStart - decoded.right.startTime)
    : undefined;
}

/** Duration from start to processing end (event / INP-style). */
export function interactionMs(entry: PerformanceBoundaryInput): number | undefined {
  const decoded = Schema.decodeUnknownEither(InteractionTimingSchema)(entry);
  return decoded._tag === 'Right'
    ? Math.max(0, decoded.right.processingEnd - decoded.right.startTime)
    : undefined;
}

/** Layout-shift score, excluding shifts that follow recent input. */
export function layoutShiftDelta(entry: PerformanceBoundaryInput): number | undefined {
  const decoded = Schema.decodeUnknownEither(LayoutShiftSchema)(entry);
  if (decoded._tag === 'Left' || decoded.right.hadRecentInput) {
    return undefined;
  }
  return decoded.right.value;
}

/** TTFB from the first navigation timing entry. */
export function navigationTtfbMs(
  entries: ReadonlyArray<PerformanceBoundaryInput>
): number | undefined {
  const firstEntry = entries[0];
  if (firstEntry === undefined) {
    return undefined;
  }
  const decoded = Schema.decodeUnknownEither(NavigationTimingSchema)(firstEntry);
  return decoded._tag === 'Right'
    ? Math.max(0, decoded.right.responseStart - decoded.right.requestStart)
    : undefined;
}
