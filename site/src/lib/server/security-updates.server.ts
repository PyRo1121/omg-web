import { Schema } from 'effect';
import {
  isSecurityUpdate,
  securityCategory,
  type SecurityFeed,
  type SecurityUpdate,
} from '../security-updates';
import { SECURITY_SNAPSHOT } from '../security-snapshot';

const CommitSchema = Schema.Struct({
  sha: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u)),
  commit: Schema.Struct({
    message: Schema.String,
    committer: Schema.Struct({
      date: Schema.String.check(Schema.makeFilter(value => Number.isFinite(Date.parse(value)))),
    }),
  }),
});
const decodeCommits = Schema.decodeUnknownSync(Schema.Array(CommitSchema));
const SOURCES = [
  { repository: 'omg', ref: 'main', branch: 'main' },
  { repository: 'omg-web', ref: 'main', branch: 'main' },
  { repository: 'omg', ref: 'codex/blue-team-pipeline-20260913', branch: 'development' },
] as const;
let cached: SecurityFeed = SECURITY_SNAPSHOT;
let expiresAt = 0;
let pending: Promise<SecurityFeed> | undefined;

async function refresh(fetcher: typeof fetch): Promise<SecurityFeed> {
  const results = await Promise.allSettled(
    SOURCES.map(async source => {
      const response = await fetcher(
        `https://api.github.com/repos/PyRo1121/${source.repository}/commits?sha=${encodeURIComponent(source.ref)}&per_page=100`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'OMG-security-updates',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (response.status === 404 && source.branch === 'development') return [];
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      return decodeCommits(await response.json())
        .filter(commit => isSecurityUpdate(commit.commit.message.split('\n')[0] ?? ''))
        .map(commit => {
          const [title = '', ...body] = commit.commit.message.split('\n');
          const previous = cached.updates.find(
            update => update.sha === commit.sha && update.repository === source.repository
          );
          return {
            sha: commit.sha,
            repository: source.repository,
            title: title.replace(/^[a-z]+(?:\([^)]*\))?:\s*/iu, ''),
            detail: previous?.detail || body.join('\n').trim().slice(0, 1800),
            date: new Date(commit.commit.committer.date).toISOString(),
            branch: source.branch,
            category: securityCategory(source.repository, title),
          } satisfies SecurityUpdate;
        });
    })
  );
  const updates = new Map<string, SecurityUpdate>();
  for (const result of results) {
    if (result.status === 'fulfilled')
      for (const update of result.value) {
        const key = `${update.repository}:${update.sha}`;
        if (!updates.has(key)) updates.set(key, update);
      }
  }
  // Preserve previously published entries through API outages and history pagination.
  for (const update of cached.updates) {
    const key = `${update.repository}:${update.sha}`;
    if (!updates.has(key) || update.branch === 'main') updates.set(key, update);
  }
  const stale = results.some(result => result.status === 'rejected');
  cached = {
    updates: [...updates.values()]
      .toSorted((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 150),
    syncedAt: stale ? cached.syncedAt : new Date().toISOString(),
    stale,
  };
  expiresAt = Date.now() + 300_000;
  return cached;
}

export async function securityFeed(fetcher: typeof fetch): Promise<SecurityFeed> {
  if (Date.now() < expiresAt) return cached;
  if (pending) return pending;
  pending = refresh(fetcher);
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
