// Boundary parser internals decode untrusted tier strings.

import * as Schema from 'effect/Schema';
import type { Tier } from '~/design-system/components/TierBadge';

/** Supported customer tiers. */
export const TierSchema = Schema.Literal('free', 'pro', 'team', 'enterprise');

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
