import * as Schema from 'effect/Schema';

/** Cloudflare Turnstile Siteverify response fields consumed by authentication. */
export const TurnstileSiteverifySchema = Schema.Struct({
  success: Schema.Boolean,
  'error-codes': Schema.optional(Schema.Array(Schema.String)),
});

/** One weekly entry from GitHub's commit-activity statistics endpoint. */
const GitHubCommitActivitySchema = Schema.Struct({
  days: Schema.Array(Schema.Number),
  total: Schema.Number,
  week: Schema.Number,
});

/** GitHub commit activity returned as an ordered list of weekly entries. */
export const GitHubCommitActivityResponseSchema = Schema.Array(GitHubCommitActivitySchema);
