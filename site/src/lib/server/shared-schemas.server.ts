import * as Schema from 'effect/Schema';
import { EMAIL_PATTERN } from '../../../../shared/email';

/** One normalized email boundary for every authenticated BFF input. */
export const NormalizedEmail = Schema.String.check(
  Schema.isMinLength(3),
  Schema.isMaxLength(320),
  Schema.isTrimmed(),
  Schema.isLowercased(),
  Schema.isPattern(EMAIL_PATTERN)
);

/** URL slug shape shared by organization bootstrap and operator lookups. */
export const OrganizationSlug = Schema.String.check(
  Schema.isMinLength(3),
  Schema.isMaxLength(48),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
);

/** Hex color accepted for CRM tag display. */
export const TagColor = Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/u));

/** Machine hostname or label reported by the CLI. */
export const MachineText = Schema.String.check(Schema.isMaxLength(256));
