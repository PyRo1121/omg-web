import { describe, expect, it } from 'vitest';
import { parseGitHubActivityCache } from './dashboard-contract';

describe('parseGitHubActivityCache', () => {
  it('decodes a valid cache entry', () => {
    const parsed = parseGitHubActivityCache({
      data: [{ label: 'Jan 1', value: 4 }],
      total: 4,
      timestamp: 1_700_000_000_000,
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        data: [{ label: 'Jan 1', value: 4 }],
        total: 4,
        timestamp: 1_700_000_000_000,
      },
    });
  });

  it('rejects a cache entry with a non-array data field', () => {
    const parsed = parseGitHubActivityCache({
      data: { label: 'Jan 1', value: 4 },
      total: 4,
      timestamp: 1,
    });
    expect(parsed.ok).toBe(false);
  });

  it('rejects a cache entry with a non-numeric total', () => {
    const parsed = parseGitHubActivityCache({
      data: [{ label: 'Jan 1', value: 4 }],
      total: '4',
      timestamp: 1,
    });
    expect(parsed.ok).toBe(false);
  });
});
