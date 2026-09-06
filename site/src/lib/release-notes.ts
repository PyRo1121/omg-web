interface ReleaseNote {
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly changes: ReadonlyArray<string>;
}

/** Reviewed summaries of published OMG releases, newest first. */
export const RELEASE_NOTES: ReadonlyArray<ReleaseNote> = [
  {
    version: 'v0.1.218',
    date: '2026-09-04',
    title: 'Clearer CLI behavior',
    changes: [
      'Keep redirected output plain and handle closed output pipes.',
      'Honor setup skip options and improve root command discovery.',
      'Improve release synchronization recovery and benchmark controls.',
    ],
  },
  {
    version: 'v0.1.217',
    date: '2026-09-04',
    title: 'Update and runtime fixes',
    changes: ['Repair the update experience and runtime command dispatch.'],
  },
  {
    version: 'v0.1.216',
    date: '2026-09-03',
    title: 'Less noise in everyday commands',
    changes: [
      'Remove per-row search separators and tighten list spacing.',
      'Show source badges inline in update lists.',
      'Warn about a missing policy file only once per process.',
    ],
  },
];

/** Format a release date in UTC so build and browser output agree. */
export function releaseDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}
