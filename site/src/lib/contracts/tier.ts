// Boundary parser internals decode untrusted tier strings.

import * as Schema from 'effect/Schema';

/** Supported customer tiers. */
const TierSchema = Schema.Literal('free', 'pro', 'team', 'enterprise');
export type Tier = Schema.Schema.Type<typeof TierSchema>;

/**
 * Parse an untrusted tier string, defaulting to free.
 *
 * @param value - Raw tier from an API or CRM record.
 * @returns A known tier.
 */
export function parseTier(value: string): Tier {
  const decoded = Schema.decodeUnknownEither(TierSchema)(value.toLowerCase());
  return decoded._tag === 'Right' ? decoded.right : 'free';
}
