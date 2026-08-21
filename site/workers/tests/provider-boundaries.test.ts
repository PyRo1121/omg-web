import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import {
  GitHubCommitActivityResponseSchema,
  TurnstileSiteverifySchema,
} from '../src/contracts/provider-boundaries';

describe('provider response boundaries', () => {
  it('decodes the Turnstile fields used by authentication', () => {
    const decoded = Schema.decodeUnknownEither(TurnstileSiteverifySchema)({
      success: false,
      'error-codes': ['invalid-input-response'],
      hostname: 'pyro1121.com',
    });

    expect(decoded._tag).toBe('Right');
    if (decoded._tag === 'Right') {
      expect(decoded.right).toEqual({
        success: false,
        'error-codes': ['invalid-input-response'],
      });
    }
  });

  it('rejects malformed Turnstile decisions', () => {
    const decoded = Schema.decodeUnknownEither(TurnstileSiteverifySchema)({
      success: 'yes',
      'error-codes': [42],
    });

    expect(decoded._tag).toBe('Left');
  });

  it('decodes GitHub weekly commit activity', () => {
    const decoded = Schema.decodeUnknownEither(GitHubCommitActivityResponseSchema)([
      { days: [0, 1, 2, 3, 4, 5, 6], total: 21, week: 1_700_000_000 },
    ]);

    expect(decoded._tag).toBe('Right');
    if (decoded._tag === 'Right') {
      expect(decoded.right[0]).toEqual({
        days: [0, 1, 2, 3, 4, 5, 6],
        total: 21,
        week: 1_700_000_000,
      });
    }
  });

  it('rejects malformed GitHub activity instead of forwarding provider data', () => {
    const decoded = Schema.decodeUnknownEither(GitHubCommitActivityResponseSchema)([
      { days: [0, 1, 'two'], total: 3, week: 1_700_000_000 },
    ]);

    expect(decoded._tag).toBe('Left');
  });
});
