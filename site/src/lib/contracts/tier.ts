// Boundary parser internals decode untrusted tier strings.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe string boundary parsing requires these operations.

import { Schema } from '@effect/schema';
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
