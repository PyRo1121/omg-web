import { describe, expect, it } from 'vitest';
import {
  inputDelayMs,
  interactionMs,
  layoutShiftDelta,
  navigationTtfbMs,
} from './site-performance-entry';

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
  it('includes connection time from navigation start', () => {
    expect(navigationTtfbMs([{ startTime: 0, responseStart: 21 }])).toBe(21);
  });

  it('reads inherited browser timing getters', () => {
    class NavigationEntry {
      get startTime(): number {
        return 0;
      }
      get responseStart(): number {
        return 42;
      }
    }
    expect(navigationTtfbMs([new NavigationEntry()])).toBe(42);
  });

  it('rejects missing or non-finite timing fields', () => {
    expect(navigationTtfbMs([{ startTime: 0 }])).toBeUndefined();
    expect(navigationTtfbMs([{ startTime: 0, responseStart: Infinity }])).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(navigationTtfbMs([])).toBeUndefined();
  });
});
