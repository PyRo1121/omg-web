import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { isServerQueryError, queryErrorStatus, shouldRetryMutation } from './query';

describe('queryErrorStatus', () => {
  it('reads ApiError.status', () => {
    expect(queryErrorStatus(new ApiError('boom', 503))).toBe(503);
  });

  it('reads an axios-shaped status', () => {
    const error = Object.assign(new Error('request failed'), {
      response: { status: 429 },
    });
    expect(queryErrorStatus(error)).toBe(429);
  });

  it('returns undefined for a plain Error', () => {
    expect(queryErrorStatus(new Error('nope'))).toBeUndefined();
  });
});

describe('isServerQueryError', () => {
  it('is true for 5xx ApiError', () => {
    expect(isServerQueryError(new ApiError('down', 500))).toBe(true);
  });

  it('is false for 4xx ApiError', () => {
    expect(isServerQueryError(new ApiError('nope', 404))).toBe(false);
  });
});

describe('shouldRetryMutation', () => {
  it('does not retry 4xx', () => {
    expect(shouldRetryMutation(0, new ApiError('nope', 400))).toBe(false);
  });

  it('retries 5xx until the limit', () => {
    expect(shouldRetryMutation(0, new ApiError('down', 503))).toBe(true);
    expect(shouldRetryMutation(2, new ApiError('down', 503))).toBe(false);
  });
});
