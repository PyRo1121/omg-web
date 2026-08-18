import { describe, expect, it } from 'vitest';
import {
  inputDelayMs,
  interactionMs,
  layoutShiftDelta,
  navigationTtfbMs,
} from './performance-entry';

describe('inputDelayMs', () => {
  it('returns processingStart minus startTime', () => {
    expect(inputDelayMs({ startTime: 10, processingStart: 18 })).toBe(8);
  });

  it('returns undefined without timing fields', () => {
    expect(inputDelayMs({ startTime: 10 })).toBeUndefined();
  });
});

describe('interactionMs', () => {
  it('returns processingEnd minus startTime', () => {
    expect(interactionMs({ startTime: 10, processingEnd: 40 })).toBe(30);
  });
});

describe('layoutShiftDelta', () => {
  it('returns the value when input was not recent', () => {
    expect(layoutShiftDelta({ value: 0.12, hadRecentInput: false })).toBe(0.12);
  });

  it('ignores shifts after recent input', () => {
    expect(layoutShiftDelta({ value: 0.12, hadRecentInput: true })).toBeUndefined();
  });
});

describe('navigationTtfbMs', () => {
  it('reads TTFB from the first navigation entry', () => {
    expect(navigationTtfbMs([{ requestStart: 5, responseStart: 21 }])).toBe(16);
  });

  it('returns undefined for an empty list', () => {
    expect(navigationTtfbMs([])).toBeUndefined();
  });
});
