import { describe, expect, it } from 'vitest';
import { RELEASE_NOTES, releaseDate } from './release-notes';

describe('reviewed release notes', () => {
  it('keeps unique versions in newest-first publication order', () => {
    const versions = RELEASE_NOTES.map(release => release.version);
    const dates = RELEASE_NOTES.map(release => release.date);
    expect(new Set(versions).size).toBe(versions.length);
    expect(dates).toEqual(dates.toSorted().toReversed());
    for (const release of RELEASE_NOTES) {
      expect(release.version).toMatch(/^v\d+\.\d+\.\d+$/u);
      expect(Number.isFinite(Date.parse(release.date))).toBe(true);
      expect(release.changes.length).toBeGreaterThan(0);
    }
  });

  it('formats publication dates in UTC', () => {
    expect(releaseDate('2026-09-04')).toBe('September 4, 2026');
  });
});
