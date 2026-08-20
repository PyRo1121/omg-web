import { Schema } from '@effect/schema';

/** Opaque license credential accepted at Worker boundaries. */
export const LicenseKey = Schema.String.pipe(Schema.minLength(1), Schema.brand('LicenseKey'));
export type LicenseKey = Schema.Schema.Type<typeof LicenseKey>;
