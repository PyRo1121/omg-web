import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isSecurityUpdate } from '../security-updates';

const sha = 'a'.repeat(40);
const commit = {
  sha,
  commit: {
    message: 'fix(security): contain installer inputs\n\nReject unexpected sources.',
    committer: { date: '2026-09-13T12:00:00Z' },
  },
};

describe('public security feed', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('includes security titles and excludes ordinary feature work', () => {
    expect(isSecurityUpdate('fix(security): validate sources')).toBe(true);
    expect(isSecurityUpdate('security: harden tool installs')).toBe(true);
    expect(isSecurityUpdate('feat: add another theme')).toBe(false);
  });

  it('keeps repositories distinct, preserves main status and caches refreshes', async () => {
    const { securityFeed } = await import('./security-updates.server');
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json([commit]));
    const feed = await securityFeed(fetcher);
    expect(feed.stale).toBe(false);
    const entries = feed.updates.filter(update => update.sha === sha);
    expect(entries).toHaveLength(2);
    expect(entries.every(update => update.branch === 'main')).toBe(true);
    expect(entries[0]?.detail).toBe('Reject unexpected sources.');
    await securityFeed(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => String(url).includes('sha=main'))).toBe(true);
  });

  it('keeps saved entries when GitHub is rate limited', async () => {
    const { securityFeed } = await import('./security-updates.server');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(null, { status: 403 }));
    const feed = await securityFeed(fetcher);
    expect(feed.stale).toBe(true);
    expect(feed.updates.length).toBeGreaterThan(0);
    expect(feed.updates.every(update => update.branch === 'main')).toBe(true);
  });

  it('rejects malformed API dates without breaking the public page', async () => {
    const { securityFeed } = await import('./security-updates.server');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json([{ ...commit, commit: { ...commit.commit, committer: { date: 'invalid' } } }])
      );
    const feed = await securityFeed(fetcher);
    expect(feed.stale).toBe(true);
    expect(feed.updates.some(update => update.sha === sha)).toBe(false);
  });
});
